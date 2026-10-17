"""Create a separate Civ7Map from a validated Fenhe intervention plan.

Never edits a source save. City identities are map plots, not transient component IDs.
Default export supplies all settlements; Transition export supplies age-ready armies.
"""
import argparse, json, sqlite3, shutil
from pathlib import Path


def rows(c, table):
    return [dict(r) for r in c.execute('SELECT * FROM "'+table+'"')]


def replace(c, table, data):
    c.execute('DELETE FROM "'+table+'"')
    if data:
        keys=list(data[0])
        c.executemany('INSERT INTO "'+table+'" ('+','.join('"'+k+'"' for k in keys)+') VALUES ('+','.join('?' for _ in keys)+')',[[r[k] for k in keys] for r in data])


def build(default, transition, plan, destination):
    default,transition,destination=map(Path,(default,transition,destination))
    if destination.resolve() in [default.resolve(),transition.resolve()]:
        raise ValueError('Source export cannot be overwritten')
    p=json.loads(Path(plan).read_text(encoding='utf-8-sig'))
    source=sqlite3.connect('file:'+default.resolve().as_posix()+'?mode=ro',uri=True);source.row_factory=sqlite3.Row
    trans=sqlite3.connect('file:'+transition.resolve().as_posix()+'?mode=ro',uri=True);trans.row_factory=sqlite3.Row
    cities=rows(source,'Cities');by_plot={x['plot']:x for x in p['settlements']}
    if set(by_plot)!=set(c['Plot'] for c in cities):
        raise ValueError('Plan settlement coordinates do not match the exported world')
    nations={n['slot']:n for n in p['polities']}
    if sorted(n['slot'] for n in p['polities'] if n['major'])!=list(range(p['majorCount'])):
        raise ValueError('Major player slots must be contiguous')
    if len(nations)!=len(p['polities']) or any(x['owner'] not in nations for x in by_plot.values()):
        raise ValueError('Duplicate or missing nation')
    if not nations[p['humanSlot']]['major']:
        raise ValueError('Human faction must be a major civilization')
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(default,destination)
    c=sqlite3.connect(destination);c.row_factory=sqlite3.Row
    old_players={r['ID']:r for r in rows(source,'Players')}
    old_attrs=rows(source,'PlayerAttributes')
    w=p['width'];h=p['height']
    # Stage independent settlements under the selected human. Native village
    # initialization would otherwise delete imported cities on inactive slots.
    city_owner={plot:(x['owner'] if nations[x['owner']]['major'] else p['humanSlot']) for plot,x in by_plot.items()}
    surviving_history={n['originNative']:slot for slot,n in nations.items() if n['id']=='p'+str(n['originNative'])}
    def owner_at(plot):
        def distance(other):
            dx=abs(plot%w-other%w);dx=min(dx,w-dx)
            return dx*dx+(plot//w-other//w)**2
        return city_owner[min(city_owner,key=lambda q:(distance(q),q))]
    capitals={}
    for slot,n in nations.items():
        owned=[x for x in p['settlements'] if x['owner']==slot]
        capitals[slot]=max(owned,key=lambda x:(x.get('capital',False),x.get('isCity',False),x['population'],-x['plot']))['plot']
    for city in cities:
        city['Owner']=city_owner[city['Plot']]
        # Native map reader treats -1 as the current owner. Old player slots
        # no longer identify the historical country after political partition.
        city['OriginalOwner']=-1
        city['IsCapital']=int(city['Plot']==capitals[city['Owner']])
        # Preserve the original city's cultural identity and historical name.
        if by_plot[city['Plot']].get('name'):city['Name']=by_plot[city['Plot']]['name']
    replace(c,'Cities',cities)
    for table,col,ref in [('PlotOwners','Owner','CityOwner'),('Districts','Owner','CityID')]:
        # Wilderness villages/discoveries are not settlement districts. Giving
        # their tribal structures to a major player creates invalid native state.
        rr=[r for r in rows(source,table) if r[ref] in city_owner]
        for r in rr:r[col]=city_owner[r[ref]]
        replace(c,table,rr)
    district_city={d['Plot']:d['CityID'] for d in rows(c,'Districts')}
    # The official Constructible_TransitionRemoves table excludes these center
    # buildings because native city creation builds them again. Importing them
    # from Default duplicates buildings and adds spurious population.
    automatic_centers={'BUILDING_PALACE','BUILDING_CITY_HALL'}
    rr=[r for r in rows(source,'Constructibles') if r['DistrictID'] in district_city and r['ConstructibleType'] not in automatic_centers]
    for r in rr:
        r['Owner']=city_owner[district_city[r['DistrictID']]]
        # Unlike Cities, the constructible reader has no -1 owner fallback.
        r['OriginalOwner']=surviving_history.get(r['OriginalOwner'],r['Owner'])
    replace(c,'Constructibles',rr)
    rr=[r for r in rows(source,'CityConnections') if r['CityID1'] in city_owner and r['CityID2'] in city_owner]
    for r in rr:
        r['Owner1']=city_owner[r['CityID1']];r['Owner2']=city_owner[r['CityID2']]
    replace(c,'CityConnections',rr)
    rr=rows(source,'PlayerWorkers');plot_city={r['ID']:r['CityOwner'] for r in rows(source,'PlotOwners')}
    for r in rr:r['PlayerID']=city_owner.get(plot_city.get(r['PlotID']),owner_at(r['PlotID']))
    replace(c,'PlayerWorkers',rr)
    attrs=rows(source,'CityAttributes')
    for r in attrs:
        if r['Type']=='Government' and r['Name']=='Level':
            r['Value']='CITY' if nations[city_owner[r['ID']]]['major'] and by_plot[r['ID']]['isCity'] else 'TOWN'
            if r['ID']==capitals[city_owner[r['ID']]] and nations[city_owner[r['ID']]]['major']:r['Value']='CITY'
    replace(c,'CityAttributes',attrs)
    player_rows=[];attributes=[]
    for slot,n in nations.items():
        base=dict(old_players[n['originNative']]);capital=capitals[slot]
        base.update(ID=slot,TeamID=slot,CivilizationType=n['civilization'] if n['major'] else 'CIVILIZATION_PLACEHOLDER_CITYSTATE',LeaderType=n['leader'],CivilizationLevelType='CIVILIZATION_LEVEL_FULL_CIV' if n['major'] else 'CIVILIZATION_LEVEL_CITY_STATE',Status='Human' if slot==p['humanSlot'] else 'AI',StartingPosition=f'{capital%w},{capital//w}',Color=n['leader'] if n['major'] else 'PLAYERCOLOR_LIGHT_YELLOW_MINOR',Initialized=1)
        player_rows.append(base)
        # Fresh political relationships, no inherited alliance or suzerainty IDs.
        for a in old_attrs:
            if a['ID']==n['originNative'] and a['Type'] in ['Age','Cities']:
                attributes.append({**a,'ID':slot})
        attributes.append({'ID':slot,'Type':'Treasury','Name':'Balance','Value':str(n['gold'])})
    replace(c,'Players',player_rows);replace(c,'PlayerAttributes',attributes)
    # Transition's Units and UnitShadows are complementary. Never combine all
    # Default units with shadows, which would create each soldier twice.
    units=rows(trans,'Units');unitattrs=rows(trans,'UnitAttributes');shadows=rows(trans,'UnitShadows')
    for u in units:u['Owner']=owner_at(u['Plot'])
    for u in shadows:u['Owner']=owner_at(u['Plot'])
    # Native transition restores shadows only for majors. Keep actual minor
    # defenders from the complete export, excluding their shadows.
    shadows=[u for u in shadows if nations[u['Owner']]['major']]
    maxid=max([u['ID'] for u in units],default=-1)+1
    default_attrs=rows(source,'UnitAttributes')
    for u in rows(source,'Units'):
        if old_players[u['Owner']]['CivilizationLevelType']!='CIVILIZATION_LEVEL_CITY_STATE':continue
        slot=owner_at(u['Plot'])
        if nations[slot]['major']:continue
        oldid=u['ID'];u.update(ID=maxid,Owner=slot);units.append(u)
        unitattrs.extend({**a,'ID':maxid} for a in default_attrs if a['ID']==oldid);maxid+=1
    replace(c,'Units',units);replace(c,'UnitAttributes',unitattrs);replace(c,'UnitShadows',shadows)
    # Old campaign achievement/relationship references must not point at the
    # newly allocated countries or trigger a victory on the opening turn.
    for table in ['HistoricMoments','RevealedPlots','CityPreviousAgeOwnerHistroy','PlayerAttributePoints','ProgressionTreeNodes','PlayerNarrativeTagPoints','PlayerUniqueGreatWorks','PlayerUnlockedTraditions','PlayerCatalogAdvisors','PlayerVictoryPoints','PlayerPastAgeVictoryHistory','Victories','Unlocks']:
        replace(c,table,[])
    c.execute("UPDATE MetaData SET Value='Transition' WHERE Name='ContentFilter'")
    c.execute("UPDATE MetaData SET Value=? WHERE Name='DisplayName'",(p['title'],))
    c.execute("UPDATE Map SET MapSizeType=?",(p.get('mapSizeType','MAPSIZE_HUGE'),))
    c.commit()
    if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity check failed')
    report={'majorCount':p['majorCount'],'minorCount':len(nations)-p['majorCount'],'settlements':len(cities),'districts':len(rows(c,'Districts')),'constructibles':len(rows(c,'Constructibles')),'plots':len(rows(c,'PlotOwners')),'units':len(units),'shadows':len(shadows),'humanSlot':p['humanSlot'],'capitalPlots':capitals}
    c.close();source.close();trans.close()
    return report


if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--default',required=True);a.add_argument('--transition',required=True);a.add_argument('--plan',required=True);a.add_argument('--out',required=True)
    v=a.parse_args();print(json.dumps(build(v.default,v.transition,v.plan,v.out),ensure_ascii=False))
