"""Generate scenario-only native independent identities and import criteria.

The game constructs its own typed tribe configuration. Never set tribe indexes
through the generic JS configuration setter (those are not equivalent types).
"""
from pathlib import Path
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]/'mod/civ7-fenhe'
config=root/'config';pool=config/'citystates';pool.mkdir(exist_ok=True)
categories=['ECONOMIC','EXPANSIONIST','SCIENTIFIC','CULTURAL','MILITARISTIC','DIPLOMATIC']
ns='ModInfo';ET.register_namespace('',ns)
tree=ET.parse(root/'fenhe.modinfo');mod=tree.getroot()
q=lambda t:'{'+ns+'}'+t
criteria=mod.find(q('ActionCriteria'));groups=mod.find(q('ActionGroups'))
for parent in (criteria,groups):
    for child in list(parent):
        if child.get('id','').startswith('fenhe-cs'):parent.remove(child)
def criterion(id,phase=None,key=None,value=None):
    c=ET.SubElement(criteria,q('Criteria'),id=id)
    ET.SubElement(c,q('MapInUse')).text='{civ7-fenhe}maps/Fenhe_Intervention.Civ7Map'
    for k,v in [('FenheImportPhase',phase),(key,value)]:
        if k is None or v is None:continue
        x=ET.SubElement(c,q('ConfigurationValueMatches'))
        for t,s in [('Group','Game'),('ConfigurationId',k),('Value',v)]:ET.SubElement(x,q(t)).text=s
def action(id,file,order):
    a=ET.SubElement(groups,q('ActionGroup'),id=id,scope='game',criteria=id)
    ET.SubElement(ET.SubElement(a,q('Properties')),q('LoadOrder')).text=str(order)
    ET.SubElement(ET.SubElement(ET.SubElement(a,q('Actions')),q('UpdateDatabase')),q('Item')).text=file
sql=["INSERT OR IGNORE INTO IndependentTribeTypes (TribeType,DefenderTagSet) VALUES ('TRIBE_FENHE_RESERVED','DEFAULT_DEFENDER_TAGS');"]
for i in range(61):
    key=f'INDEPENDENT_FENHE_{i}'
    sql.append(f"INSERT OR IGNORE INTO Types (Type,Kind) VALUES ('{key}','KIND_INDEPENDENT');")
    sql.append(f"INSERT OR IGNORE INTO Independents (IndependentType,Name,CityStateName,CityStateType,Affinity,TribeType,BiomeType) VALUES ('{key}','分合城邦 {i+1}','分合城邦 {i+1}','DIPLOMATIC','AFFINITY_NEUTRAL','TRIBE_FENHE_RESERVED',NULL);")
(pool/'identities.sql').write_text('\n'.join(sql),encoding='utf-8')
criterion('fenhe-cs-identities');action('fenhe-cs-identities','config/citystates/identities.sql',2200)
database=groups[-1].find(q('Actions')).find(q('UpdateDatabase'))
for file in ['config/fenhe-size.xml','config/fenhe-capital-effects.xml','config/fenhe-capital.xml']:
    ET.SubElement(database,q('Item')).text=file
for i in range(61):
    for cat in categories:
        id=f'fenhe-cs-{i}-{cat.lower()}';file=f'config/citystates/{i}-{cat.lower()}.sql'
        (root/file).write_text(f"UPDATE Independents SET CityStateType='{cat}',TribeType='TRIBE_DEFAULT',BiomeType='BIOME_PLAINS' WHERE IndependentType='INDEPENDENT_FENHE_{i}';\n",encoding='utf-8')
        criterion(id,key=f'FenheMinor{i}',value=cat);action(id,file,2300)
# The normal map's major-player count can cap births below the imported plan.
# Only configured Fenhe identities are eligible during INIT; request the whole
# pool. This override disappears when the completed world is saved/reloaded.
(pool/'isolate.sql').write_text("UPDATE Independents SET TribeType='TRIBE_FENHE_RESERVED',BiomeType=NULL WHERE IndependentType NOT LIKE 'INDEPENDENT_FENHE_%';\nUPDATE GlobalParameters SET Value='62' WHERE Name='INDEPENDENT_NUM_PER_MAJOR';\n",encoding='utf-8')
criterion('fenhe-cs-isolate',phase='INIT');action('fenhe-cs-isolate','config/citystates/isolate.sql',2400)
# Remove probe-only actions and the unneeded game map-size override.
for group in list(groups):
    actions=group.find(q('Actions'))
    if actions is None:continue
    for a in list(actions):
        if group.get('id')=='fenhe-game' and a.tag==q('UIScripts'):
            actions.remove(a);continue
        if a.tag==q('AgeTransitionScripts'):actions.remove(a)
        elif a.tag==q('UpdateDatabase') and len(a)==1 and any(x.text=='config/fenhe-size.xml' for x in a):actions.remove(a)
        elif a.tag==q('ImportFiles'):
            for x in list(a):
                if x.text=='bridge/age-probe.js':a.remove(x)
props=mod.find(q('Properties'))
props.find(q('Version')).text='0.2.0-alpha'
props.find(q('AffectsSavedGames')).text='1'
props.find(q('Description')).text='分合：推演天下兴亡，通过本地接入器在原地图创建新时代国家与城邦。实验版。'
mod.set('version','2')
ET.indent(tree,space=' ');tree.write(root/'fenhe.modinfo',encoding='utf-8',xml_declaration=True)
print('Generated 61 native independent identities and 366 scenario-only category conditions.')
