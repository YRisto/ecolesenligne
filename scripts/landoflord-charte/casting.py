# Distribution : chaque personnage = une tenue Flare + pièces + matières de la charte.
import json
W = lambda f, o: ['hero/%s.blend' % f, o]
WF = lambda f, o: ['heroine/%s.blend' % f, o]
MEL = [1, 3, 5, 7, 9, 11, 13, 14, 15, 16, 19, 21, 22, 24]      # repos 2, marche 4, frappe 4, touché, mort 3
SHO = [1, 3, 5, 7, 9, 11, 29, 30, 31, 32, 19, 21, 22, 24]      # idem, tir à la place de la frappe
NPC = [1, 2, 3, 4, 26]                                          # repos 4, geste
PLATE_BARE = [W('plate_greaves', 'HumanMale'), W('plate_boots', 'HumanMale'), W('plate_gauntlets', 'HumanMale')]
CHAIN_BARE = [W('chain_greaves', 'HumanMale'), W('chain_boots', 'HumanMale'), W('chain_gloves', 'HumanMale')]
SH = {'HeavyShield': .64, 'LightShield': .62}
C = {
 # --- ennemis ---
 'garde':      dict(base='hero/chainmail.blend', add=[W('shield', 'HeavyShield'), W('shortsword', 'Shortsword')], colors={'Leather': 'leather', 'RoughSteel': 'slate', 'BlackenedIron': 'steel_dull'}),
 'sergent':    dict(base='hero/chainmail.blend', add=[W('mace', 'IronMaceHigh')], colors={'Leather': 'red', 'Chain': 'iron', 'Steel': 'steel_dull'}, scale=1.04),
 'pillard':    dict(base='hero/leather_armor.blend', add=[W('male_head1', 'MaleHead1'), W('hand_axe', 'HandAxe')], colors={'LeatherDistressed': 'leather', 'ClothBlack': 'red', 'Black': 'leather_black', 'DarkHair': 'hair_brown', 'Skin': 'skin'}),
 'arbal':      dict(base='hero/clothes.blend', add=[W('leather_hood', 'MaleHead1'), W('shortbow', 'Shortbow')], hide=['MaleHead1'], colors={'TanCloth': 'olive', 'BlueCloth': 'brown', 'WhiteCloth': 'cream', 'MaleHead1:Leather': 'olive'}, frames=SHO),
 'lancier':    dict(base='hero/chainmail.blend', add=[W('zweihander', 'Zweihander')], colors={'Leather': 'slate', 'Steel': 'steel'}),
 'reitre':     dict(base='hero/plate_armor.blend', add=[W('longsword', 'Longsword'), W('buckler', 'LightShield')], colors={'Steel': 'iron', 'SteelDull': 'steel_dull', 'Leather': 'leather_black', 'Wood': 'wood_dark'}),
 'borgne':     dict(base='hero/leather_armor.blend', add=[W('male_head2', 'MaleHead1'), W('battle_axe', 'BattleAxe')], colors={'LeatherDistressed': 'leather_black', 'ClothBlack': 'wine', 'Black': 'leather_black', 'Skin': 'skin_pale'}, scale=1.08),
 'veneur':     dict(base='hero/leather_armor.blend', add=[W('leather_hood', 'MaleHead1'), W('longbow', 'LongBow')], colors={'LeatherDistressed': 'green', 'ClothBlack': 'olive', 'MaleHead1:Leather': 'green', 'Black': 'leather'}, frames=SHO),
 'garde_royal':dict(base='hero/plate_armor.blend', add=[W('shield', 'HeavyShield'), W('longsword', 'Longsword')], colors={'SteelDull': 'gold', 'Leather': 'blue', 'RoughSteel': 'blue', 'BlackenedIron': 'gold'}, scale=1.03),
 'renaud':     dict(base='hero/plate_cuirass.blend', add=PLATE_BARE + [W('male_head1', 'MaleHead1'), W('longsword', 'Longsword'), W('shield', 'HeavyShield')], colors={'Leather': 'green', 'SteelDull': 'brass', 'RoughSteel': 'green', 'BlackenedIron': 'brass', 'DarkHair': 'hair_brown', 'WhiteCloth': 'green'}, scale=1.06),
 'champion':   dict(base='hero/plate_armor.blend', add=[W('maul', 'Maul')], colors={'Steel': 'brass', 'SteelDull': 'gold', 'Leather': 'red'}, scale=1.12),
 'marechal':   dict(base='hero/plate_armor.blend', add=[W('greatsword', 'Greatsword')], colors={'Steel': 'iron', 'SteelDull': 'red', 'Leather': 'leather_black', 'BlueCrystal': 'red'}, scale=1.12),
 'hagen':      dict(base='hero/chain_cuirass.blend', add=CHAIN_BARE + [W('plate_helm', 'HumanMale'), W('longsword', 'Longsword'), W('shield', 'HeavyShield')], colors={'Leather': 'wine', 'RoughSteel': 'wine', 'BlackenedIron': 'steel', 'Chain': 'steel_dull'}, scale=1.08),
 'contrebandier': dict(base='hero/clothes.blend', add=[W('club', 'Club')], colors={'TanCloth': 'grey', 'BlueCloth': 'brown', 'WhiteCloth': 'rags', 'DarkHair': 'hair_dark', 'Skin': 'skin_tan'}),
 'grolard':    dict(base='hero/clothes.blend', add=[W('male_head2', 'MaleHead1'), W('reinforced_club', 'ReinforcedClub')], hide=['MaleHead1'], colors={'TanCloth': 'purple', 'BlueCloth': 'black', 'WhiteCloth': 'cream', 'Metal': 'gold', 'Skin': 'skin_pale'}, scale=1.12),
 'braconnier': dict(base='hero/clothes.blend', add=[W('shortbow', 'Shortbow')], colors={'TanCloth': 'rust', 'BlueCloth': 'olive', 'WhiteCloth': 'tan', 'DarkHair': 'hair_red'}, frames=SHO),
 'deserteur':  dict(base='hero/chain_cuirass.blend', add=[W('cloth_pants', 'HumanMale'), W('leather_boots', 'HumanMale'), W('default_hands', 'HumanMale'), W('male_head1', 'MaleHead1'), W('shortsword', 'Shortsword')], colors={'Leather': 'slate', 'BlueCloth': 'slate', 'TanCloth': 'slate', 'Rags': 'invis', 'DarkHair': 'hair_blond', 'LeatherDistressed': 'leather'}),
 'sentinelle': dict(base='hero/chainmail.blend', add=[W('greatbow', 'Greatbow')], colors={'Leather': 'red', 'Chain': 'steel_dull'}, frames=SHO),
 'prevot':     dict(base='hero/plate_armor.blend', add=[W('longsword', 'Longsword'), W('shield', 'HeavyShield')], colors={'Steel': 'steel_dull', 'SteelDull': 'wine', 'Leather': 'black', 'RoughSteel': 'wine', 'BlackenedIron': 'gold', 'Guard': 'gold'}, scale=1.12),
 'vouivre':    dict(base='heroine/leather_armor.blend', add=[WF('head_long', 'LongHair'), WF('longsword', 'Longsword'), WF('buckler', 'LightShield')], colors={'LeatherDistressed': 'leather_black', 'ClothBlack': 'teal', 'Black': 'teal', 'SteelRough': 'brass', 'DarkHair': 'hair_red', 'HairHighlights': 'hair_red', 'Skin': 'skin_pale', 'Wood': 'teal', 'RoughSteel': 'brass'}, scale=1.06, scale_obj={'LightShield': 1.0}),
 # --- personnages rencontrés ---
 'goupil':     dict(base='hero/clothes.blend', colors={'TanCloth': 'slate', 'BlueCloth': 'brown', 'WhiteCloth': 'cream', 'DarkHair': 'hair_red'}, frames=NPC),
 'ysolde':     dict(base='heroine/clothes.blend', add=[WF('head_long', 'LongHair')], colors={'TanCloth': 'purple', 'BlueCloth': 'wine', 'WhiteCloth': 'cream', 'Metal': 'gold', 'DarkHair': 'hair_blond', 'HairHighlights': 'hair_blond', 'Skin': 'skin_pale'}, frames=NPC),
 'fulbert':    dict(base='hero/robes.blend', add=[W('staff', 'Staff')], colors={'Cloth': 'red', 'Trim': 'ochre', 'Crystal': 'brass'}, frames=NPC),
 'ermite':     dict(base='hero/robes.blend', add=[W('staff', 'Staff')], colors={'Cloth': 'tan', 'Trim': 'cream', 'Crystal': 'wood', 'Skin': 'skin_tan'}, frames=NPC),
 'chancelier': dict(base='hero/robes.blend', add=[W('rod', 'Rod')], colors={'Cloth': 'purple', 'Trim': 'gold', 'Crystal': 'gold', 'Blade': 'gold', 'Skin': 'skin_pale'}, frames=NPC),
 'capitaine':  dict(base='hero/plate_cuirass.blend', add=PLATE_BARE + [W('male_head1', 'MaleHead1')], colors={'Leather': 'blue', 'SteelDull': 'steel_dull', 'DarkHair': 'hair_grey', 'WhiteCloth': 'blue'}, frames=NPC),
 'barnabe':    dict(base='hero/robes.blend', colors={'Cloth': 'black', 'Trim': 'cream', 'Skin': 'skin_pale'}, frames=NPC),
 'odon':       dict(base='hero/robes.blend', add=[W('staff', 'Staff')], colors={'Cloth': 'brown', 'Trim': 'tan', 'Crystal': 'wood'}, frames=NPC),
 'anselme':    dict(base='hero/clothes.blend', add=[W('male_head2', 'MaleHead1')], hide=['MaleHead1'], colors={'TanCloth': 'green', 'BlueCloth': 'grey', 'WhiteCloth': 'rags', 'Skin': 'skin_pale'}, frames=NPC),
 'brune':      dict(base='heroine/leather_armor.blend', add=[WF('head_long', 'LongHair'), WF('war_hammer', 'Warhammer.001')], colors={'LeatherDistressed': 'leather', 'ClothBlack': 'rust', 'Black': 'leather_black', 'DarkHair': 'hair_brown', 'HairHighlights': 'hair_brown', 'Skin': 'skin_tan'}, frames=NPC),
 'reine':      dict(base='heroine/robes.blend', add=[WF('head_long', 'LongHair')], colors={'Cloth': 'blue', 'Trim': 'gold', 'DarkHair': 'hair_blond', 'HairHighlights': 'hair_blond', 'Skin': 'skin_pale'}, frames=NPC),
 'aldric':     dict(base='hero/plate_cuirass.blend', add=PLATE_BARE + [W('male_head1', 'MaleHead1'), W('longsword', 'Longsword')], colors={'Leather': 'red', 'SteelDull': 'steel_dull', 'DarkHair': 'hair_dark', 'WhiteCloth': 'red'}, frames=NPC),
}
for k, v in C.items():
    v = dict(v); v['name'] = k; v.setdefault('frames', MEL); v.setdefault('scale_obj', SH); v.update(fw=288, fh=208, eye=1.45, span=2.8)
    json.dump(v, open('/home/claude/work/specs/c/%s.json' % k, 'w'))
print(len(C))
