export function isResourceDamaged(resource) {
  if (resource.isOffMap) return false;
  const plot = GameplayMap.getLocationFromIndex(resource.value);
  return MapConstructibles.getHiddenFilteredConstructibles(plot.x, plot.y)
    .some(id => Constructibles.getByComponentID(id)?.damaged);
}

export const CARD_NOTIFICATIONS = {
  NOTIFICATION_ASSIGN_NEW_RESOURCES: 'resources',
  NOTIFICATION_TRADITIONS_AVAILABLE: 'policies',
  NOTIFICATION_CRISIS: 'policies'
};

// Classify the current age's active resource modifiers. A resource with any
// other local slot effect still deserves a reminder, as do unknown resources.
export function productionOnlyResources(info) {
  const effects = new Map(), active = new Set(), argumentsById = new Map();
  info.DynamicModifiers?.forEach(row => effects.set(row.ModifierType, row.EffectType));
  info.GameModifiers?.forEach(row => active.add(row.ModifierId));
  info.ModifierArguments?.forEach(({ ModifierId, Name, Value }) => {
    if (Name !== 'ResourceType' && Name !== 'Empire') return;
    if (!argumentsById.has(ModifierId)) argumentsById.set(ModifierId, {});
    argumentsById.get(ModifierId)[Name] = Value;
  });
  const production = new Set(), other = new Set();
  info.Modifiers?.forEach(row => {
    const args = argumentsById.get(row.ModifierId);
    if (!args?.ResourceType || !active.has(row.ModifierId) || ['true','1'].includes(String(args.Empire).toLowerCase())) return;
    const effect = effects.get(row.ModifierType);
    const seasonal = ['EFFECT_CITY_ADJUST_UNIT_PRODUCTION_PER_RESOURCE',
      'EFFECT_CITY_ADJUST_CONSTRUCTIBLE_PRODUCTION_PER_RESOURCE','EFFECT_CITY_ADJUST_BIOME_WONDER_PRODUCTION_PER_RESOURCE'].includes(effect);
    (seasonal ? production : other).add(args.ResourceType);
  });
  for (const type of other) production.delete(type);
  return production;
}

// Read actual committed slots. Never create UI models (whose cleanup acknowledges
// notifications), select resources, or submit an assignment while checking.
export function readCardNeeds({ player, playerID, info, operations, assignType, location, slotTypes, productionOnly, kinds = ['resources', 'policies'] }) {
  const empty = (kinds.includes('policies') ? slotTypes : []).map(type => ({ type,
    count: Math.max(0, (player.Culture?.getNumCultureSlots(type) ?? 0) -
      (player.Culture?.getActiveTraditions(type)?.length ?? 0)) }));
  let resources = false, hasOptional = false, hasRegular = false;
  let eligibleResources = 0, damagedResources = 0, optionalResources = 0, regularResources = 0, unknownResources = 0;
  if (kinds.includes('resources') && player.Resources && !player.Resources.isResourceAssignmentLocked()) {
    const cities = (player.Cities?.getCities() ?? []).filter(c => c.owner === playerID && c.Resources);
    const key = r => `${r.isOffMap ? 'off' : 'plot'}:${r.value}`;
    const assigned = new Set(cities.flatMap(c => c.Resources.getAssignedResources().map(key)));
    const slots = cities.filter(c => c.Resources.getAssignedResourcesCap() > c.Resources.getAssignedResources().length);
    outer: for (const r of player.Resources.getResources()) {
      if (assigned.has(key(r))) continue;
      if (isResourceDamaged(r)) {
        eligibleResources++; damagedResources++;
        continue;
      }
      const def = info.Resources.lookup(r.uniqueResource.resource);
      if (!def || !def.ResourceClassType || !def.ResourceType) {
        eligibleResources++; unknownResources++;
        continue;
      }
      if (['RESOURCECLASS_EMPIRE', 'RESOURCECLASS_TREASURE'].includes(def.ResourceClassType)) continue;
      eligibleResources++;
      if (productionOnly?.has(def.ResourceType) && !(def.BonusResourceSlots > 0)) {
        hasOptional = true;
        optionalResources++;
        continue;
      }
      hasRegular = true;
      regularResources++;
      for (const city of slots) {
        if (def.ResourceClassType === 'RESOURCECLASS_CITY' && city.isTown) continue;
        const args = { City: city.id.id, ID: r.isOffMap ? r.value : -1, Flags: !!r.isOffMap };
        if (!r.isOffMap) args.Location = location(r.value);
        if (operations.canStart(playerID, assignType, args, false)?.Success) { resources = true; break outer; }
      }
    }
  }
  return {
    resources,
    onlyOptional: hasOptional && !hasRegular,
    // Native resource blockers may be stale when every eligible unassigned item is
    // deliberately ignored. Unknown metadata or any healthy regular resource is
    // evidence that the engine still owns the decision, so keep its blocker.
    suppressNativeResourceNotification: eligibleResources > 0 && !hasRegular && !unknownResources &&
      (hasOptional || damagedResources > 0),
    resourceEvidence: { eligible: eligibleResources, damaged: damagedResources,
      optional: optionalResources, regular: regularResources, unknown: unknownResources },
    policies: empty.some(s => s.count > 0), empty
  };
}

export function createCardSkips() {
  let scope; const skipped = new Set();
  return {
    sync(next) { if (scope !== next) { scope = next; skipped.clear(); } },
    has(kind) { return skipped.has(kind); },
    skip(kind) { skipped.add(kind); },
    clear() { scope = undefined; skipped.clear(); }
  };
}

