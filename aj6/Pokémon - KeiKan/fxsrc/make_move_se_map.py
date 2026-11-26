# 기술 번호 → 효과음 (assets/sounds/sfx/moves/se_<이름>.mp3) 짝 만들기 → lib/battleCore.jbl 의 moveSe() 목록을 새로 씀
#   1) 손으로 고른 짝 (원작 에메랄드 애니메이션에서 쓰는 소리에 가깝게)  2) 이름이 같은 효과음  3) 타입 · 분류 (물리 · 특수 · 변화) 기본값
# 쓰는 법: python3 fxsrc/make_move_se_map.py   (게임 폴더에서)
import re, os, json

HERE = os.path.dirname(os.path.abspath(__file__)); GAME = os.path.dirname(HERE)
SE = sorted(f[3:-4] for f in os.listdir(os.path.join(GAME, 'assets/sounds/sfx/moves')) if f.startswith('se_'))

MAN = {
 'Brainstorm': 'psybeam',
 'Pound': 'comet_punch', 'KarateChop': 'vital_throw', 'MegaPunch': 'mega_kick2', 'IcePunch': 'icy_wind', 'ThunderPunch': 'thunderbolt2',
 'ViceGrip': 'vicegrip', 'Guillotine': 'vicegrip', 'Whirlwind': 'gust2', 'Slam': 'take_down', 'VineWhip': 'bind', 'Stomp': 'mega_kick2',
 'DoubleKick': 'jump_kick', 'RollingKick': 'mega_kick2', 'HighJumpKick': 'jump_kick', 'FuryAttack': 'horn_attack', 'HornDrill': 'horn_attack',
 'Tackle': 'take_down', 'BodySlam': 'take_down', 'Wrap': 'bind', 'Thrash': 'mega_kick2', 'DoubleEdge': 'take_down', 'PoisonSting': 'horn_attack',
 'Twineedle': 'horn_attack', 'PinMissile': 'horn_attack', 'Growl': 'uproar', 'Roar': 'uproar', 'SonicBoom': 'razor_wind2', 'Disable': 'lock_on',
 'Acid': 'toxic', 'WaterGun': 'bubble2', 'IceBeam': 'blizzard2', 'AuroraBeam': 'psybeam2', 'Peck': 'horn_attack', 'DrillPeck': 'horn_attack',
 'Submission': 'vital_throw2', 'LowKick': 'jump_kick', 'Counter': 'reversal', 'SeismicToss': 'vital_throw2', 'MegaDrain': 'absorb_2',
 'LeechSeed': 'absorb', 'Growth': 'stat_increase', 'RazorLeaf': 'razor_wind', 'StunSpore': 'poison_powder', 'SleepPowder': 'poison_powder',
 'FireSpin': 'flame_wheel2', 'ThunderShock': 'thunderbolt2', 'Thunder': 'thunderbolt', 'Fissure': 'earthquake', 'Confusion': 'psybeam2',
 'Psychic': 'psybeam', 'Hypnosis': 'supersonic', 'Meditate': 'stat_increase', 'Agility': 'double_team', 'QuickAttack': 'take_down',
 'Rage': 'take_down', 'NightShade': 'nightmare', 'Mimic': 'sketch', 'Recover': 'morning_sun', 'Smokescreen': 'haze', 'Withdraw': 'harden',
 'DefenseCurl': 'harden', 'LightScreen': 'reflect', 'FocusEnergy': 'charge', 'Bide': 'charge', 'MirrorMove': 'metronome',
 'EggBomb': 'self_destruct', 'Smog': 'toxic', 'Sludge': 'toxic', 'BoneClub': 'bonemerang', 'FireBlast': 'flamethrower', 'Clamp': 'crabhammer',
 'SkullBash': 'take_down', 'SpikeCannon': 'horn_attack', 'Constrict': 'bind', 'Amnesia': 'stat_increase', 'Kinesis': 'teleport',
 'SoftBoiled': 'milk_drink', 'Glare': 'leer', 'DreamEater': 'giga_drain', 'PoisonGas': 'haze', 'Barrage': 'self_destruct',
 'LeechLife': 'absorb', 'LovelyKiss': 'attract', 'SkyAttack': 'fly', 'Transform': 'teleport', 'Spore': 'poison_powder', 'Flash': 'detect',
 'Psywave': 'psybeam2', 'Splash': 'bubble3', 'FurySwipes': 'scratch', 'Rest': 'yawn', 'RockSlide': 'rock_throw', 'HyperFang': 'bite',
 'Sharpen': 'harden', 'Conversion': 'teleport', 'SuperFang': 'bite', 'Slash': 'cut', 'Substitute': 'double_team', 'Struggle': 'take_down',
 'TripleKick': 'jump_kick', 'Thief': 'faint_attack', 'SpiderWeb': 'string_shot', 'MindReader': 'lock_on', 'Curse': 'nightmare',
 'Flail': 'reversal', 'Conversion2': 'teleport', 'Aeroblast': 'hyper_beam2', 'CottonSpore': 'poison_powder', 'Spite': 'nightmare',
 'PowderSnow': 'icy_wind', 'Protect': 'detect', 'MachPunch': 'comet_punch', 'ScaryFace': 'leer', 'FeintAttack': 'faint_attack',
 'SweetKiss': 'attract', 'SludgeBomb': 'toxic', 'MudSlap': 'sand_attack', 'Octazooka': 'hydro_pump', 'Spikes': 'rock_throw',
 'ZapCannon': 'thunderbolt', 'Foresight': 'lock_on', 'DestinyBond': 'nightmare', 'BoneRush': 'bonemerang', 'Outrage': 'mega_kick2',
 'Endure': 'harden', 'Rollout': 'take_down', 'FalseSwipe': 'cut', 'Spark': 'thunderbolt2', 'FuryCutter': 'cut', 'SteelWing': 'wing_attack',
 'MeanLook': 'leer', 'SleepTalk': 'snore', 'Return': 'take_down', 'Present': 'self_destruct', 'Frustration': 'take_down',
 'Safeguard': 'reflect', 'PainSplit': 'absorb_2', 'Magnitude': 'earthquake', 'DynamicPunch': 'mega_kick2', 'Megahorn': 'horn_attack',
 'DragonBreath': 'dragon_rage', 'Pursuit': 'faint_attack', 'RapidSpin': 'twister', 'IronTail': 'mega_kick2', 'MetalClaw': 'scratch',
 'Synthesis': 'morning_sun', 'HiddenPower': 'swift', 'CrossChop': 'vital_throw', 'SunnyDay': 'morning_sun', 'Crunch': 'bite',
 'MirrorCoat': 'reflect', 'PsychUp': 'stat_increase', 'ExtremeSpeed': 'take_down', 'AncientPower': 'rock_throw', 'ShadowBall': 'confuse_ray',
 'FutureSight': 'psybeam', 'RockSmash': 'brick_break', 'BeatUp': 'comet_punch', 'FakeOut': 'double_slap', 'Stockpile': 'charge',
 'Swallow': 'milk_drink', 'Torment': 'swagger', 'WillOWisp': 'ember', 'Memento': 'nightmare', 'Facade': 'take_down', 'FocusPunch': 'mega_kick2',
 'SmellingSalts': 'double_slap', 'FollowMe': 'encore', 'NaturePower': 'metronome', 'Taunt': 'swagger2', 'HelpingHand': 'encore',
 'Trick': 'teleport', 'RolePlay': 'sketch', 'Wish': 'heal_bell', 'Assist': 'metronome', 'Ingrain': 'absorb', 'Superpower': 'mega_kick2',
 'MagicCoat': 'reflect', 'Recycle': 'metronome', 'Revenge': 'reversal', 'KnockOff': 'double_slap', 'Endeavor': 'reversal',
 'Eruption': 'heat_wave', 'SkillSwap': 'teleport', 'Imprison': 'lock_on', 'Refresh': 'heal_bell', 'Grudge': 'nightmare', 'Snatch': 'faint_attack',
 'SecretPower': 'take_down', 'ArmThrust': 'comet_punch', 'Camouflage': 'minimize', 'TailGlow': 'charge', 'LusterPurge': 'psybeam',
 'MistBall': 'mist', 'FeatherDance': 'gust2', 'BlazeKick': 'fire_punch', 'MudSport': 'sand_attack', 'IceBall': 'icy_wind', 'NeedleArm': 'horn_attack',
 'SlackOff': 'yawn', 'HyperVoice': 'uproar', 'PoisonFang': 'bite', 'CrushClaw': 'scratch', 'BlastBurn': 'explosion', 'HydroCannon': 'hydro_pump',
 'MeteorMash': 'mega_kick2', 'Astonish': 'lick', 'WeatherBall': 'swift', 'Aromatherapy': 'sweet_scent', 'FakeTears': 'bubble3',
 'AirCutter': 'razor_wind2', 'Overheat': 'flamethrower', 'OdorSleuth': 'lock_on', 'RockTomb': 'rock_throw', 'SilverWind': 'gust',
 'MetalSound': 'screech', 'Tickle': 'teeter_dance', 'WaterSpout': 'surf', 'SignalBeam': 'psybeam2', 'GrassWhistle': 'grasswhistle', 'SacredFire': 'sacred_fire2', 'TriAttack': 'tri_attack2', 'ShadowPunch': 'faint_attack',
 'Extrasensory': 'psybeam2', 'SheerCold': 'blizzard', 'MuddyWater': 'surf', 'BulletSeed': 'comet_punch', 'AerialAce': 'cut',
 'IcicleSpear': 'icy_wind', 'IronDefense': 'harden', 'Block': 'leer', 'Howl': 'uproar', 'DragonClaw': 'scratch', 'FrenzyPlant': 'petal_dance',
 'BulkUp': 'belly_drum', 'Bounce': 'fly', 'MudShot': 'sand_attack', 'PoisonTail': 'mega_kick2', 'Covet': 'attract', 'VoltTackle': 'thunderbolt',
 'MagicalLeaf': 'razor_wind', 'WaterSport': 'bubble3', 'CalmMind': 'stat_increase', 'LeafBlade': 'cut', 'DragonDance': 'swords_dance',
 'RockBlast': 'rock_throw', 'ShockWave': 'thunder_wave', 'WaterPulse': 'bubble_beam2', 'DoomDesire': 'cosmic_power', 'PsychoBoost': 'psybeam',
 'AuraSphere': 'hyper_beam2', 'Overcharge': 'thunderbolt', 'DarkPulse': 'psybeam2', 'BugBuzz': 'uproar', 'DragonPulse': 'dragon_rage', 'FlashCannon': 'hyper_beam2',
 'EnergyBall': 'solar_beam', 'FocusBlast': 'hyper_beam2', 'EarthPower': 'earthquake', 'GigaImpact': 'take_down', 'Bulldoze': 'earthquake',
 'StompingTantrum': 'earthquake', 'HighHorsepower': 'earthquake', 'StoneEdge': 'rock_throw', 'StealthRock': 'rock_throw', 'SmackDown': 'rock_throw',
 'IronHead': 'headbutt', 'ZenHeadbutt': 'headbutt', 'HeadSmash': 'take_down', 'BraveBird': 'fly', 'XScissor': 'cut', 'NightSlash': 'cut',
 'PsychoCut': 'cut', 'ShadowClaw': 'scratch', 'IceShard': 'icy_wind', 'IceFang': 'bite', 'FireFang': 'bite', 'ThunderFang': 'bite',
 'Discharge': 'thunderbolt', 'WildCharge': 'thunderbolt2', 'AquaJet': 'waterfall', 'AquaTail': 'waterfall', 'Scald': 'hydro_pump',
 'MoonBlast': 'moonlight', 'Moonblast': 'moonlight', 'DazzlingGleam': 'detect', 'DrainingKiss': 'attract', 'PlayRough': 'double_slap',
 'NastyPlot': 'swagger', 'Roost': 'wing_attack', 'Tailwind': 'gust', 'UTurn': 'take_down', 'CloseCombat': 'mega_kick2', 'DrainPunch': 'giga_drain',
 'GunkShot': 'toxic', 'PoisonJab': 'horn_attack', 'SeedBomb': 'self_destruct', 'MudBomb': 'self_destruct', 'Hurricane': 'twister',
 'AirSlash': 'razor_wind2', 'HeatCrash': 'take_down', 'HeavySlam': 'take_down', 'Overdrive': 'uproar', 'Boomburst': 'uproar',
}
# 타입 번호 (moveUi typeColor 순서: 0 ??? · 1 노말 · 2 불꽃 · 3 물 · 4 풀 · 5 전기 · 6 얼음 · 7 격투 · 8 독 · 9 땅 · 10 비행 · 11 에스퍼
#   12 벌레 · 13 바위 · 14 고스트 · 15 드래곤 · 16 악 · 17 강철 · 18 페어리) → [물리, 특수, 변화]
TYPE = {1: ['take_down', 'swift', 'metronome'], 2: ['fire_punch', 'flamethrower', 'ember'], 3: ['waterfall', 'surf', 'bubble3'],
        4: ['razor_wind', 'solar_beam', 'absorb'], 5: ['thunderbolt2', 'thunderbolt', 'thunder_wave'], 6: ['icy_wind', 'blizzard', 'mist'],
        7: ['vital_throw', 'hyper_beam2', 'belly_drum'], 8: ['horn_attack', 'toxic', 'poison_powder'], 9: ['dig', 'earthquake', 'sand_attack'],
        10: ['wing_attack', 'gust', 'gust2'], 11: ['take_down', 'psybeam', 'teleport'], 12: ['horn_attack', 'string_shot2', 'string_shot'],
        13: ['rock_throw', 'rock_throw', 'harden'], 14: ['lick', 'nightmare', 'confuse_ray'], 15: ['scratch', 'dragon_rage', 'swords_dance'],
        16: ['bite', 'faint_attack', 'swagger'], 17: ['vicegrip', 'hyper_beam2', 'harden'], 18: ['double_slap', 'moonlight', 'charm']}

def snake(n): return re.sub(r'(?<!^)(?=[A-Z])', '_', n).lower()

def main():
    s = open(os.path.join(GAME, 'assets/codes/moveManager.jb'), encoding='utf-8').read()
    ids = {v: int(k) for k, v in re.findall(r'movedex\[(\d+)\] = (mv\w+);', s)}
    data = {n: json.loads('[' + b + ']') for n, b in re.findall(r'^\s*(mv\w+) = \[([^\]]*)\];', s, re.M) if n in ids}
    pairs = []; how = {'man': 0, 'name': 0, 'type': 0, 'none': 0}
    for n, d in sorted(data.items(), key=lambda x: ids[x[0]]):
        nm = n[2:]; cat, ty = d[1], d[5]; se = None
        if nm in MAN: se = MAN[nm]; how['man'] += 1
        elif snake(nm) in SE: se = snake(nm); how['name'] += 1
        elif ty in TYPE and 0 <= cat <= 2: se = TYPE[ty][cat]; how['type'] += 1
        else: how['none'] += 1
        if se:
            assert se in SE, (nm, se); pairs.append((ids[n], SE.index(se) + 1))
    names = ', '.join(f'"{x}"' for x in SE)
    code = ("// ── 기술 효과음 (fxsrc/make_move_se_map.py 가 만듦 · 손으로 고치지 말 것) ──\n"
            "func string moveSe(int mv){\n"
            f"    var list call seNames = [{names}];\n"
            f"    var list call seMoves = [{', '.join(str(a) for a, b in pairs)}];\n"
            f"    var list call seIdx = [{', '.join(str(b) for a, b in pairs)}];\n"
            "    var int call at = seMoves.find(mv);\n"
            "    var string call r = \"\";\n"
            "    if [at != 0]{\n"
            "        r = seNames[seIdx[at]];\n"
            "    }\n"
            "    return(r);\n"
            "}\n"
            "// ── 기술 효과음 끝 ──\n")
    p = os.path.join(GAME, 'lib/battleCore.jbl'); t = open(p, encoding='utf-8').read()
    a = '// ── 기술 효과음 (fxsrc'; b = '// ── 기술 효과음 끝 ──\n'
    if a in t: t = t[:t.index(a)] + code + t[t.index(b) + len(b):]
    else: raise SystemExit('battleCore.jbl 에 표시 줄이 없음')
    open(p, 'w', encoding='utf-8').write(t)
    print(how, len(pairs), 'pairs ·', len(SE), 'sounds')

if __name__ == '__main__':
    main()
