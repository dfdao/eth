import { DarkForest, DarkForest__getGraphConstantsResultValue0Struct } from '../../generated/DarkForest/DarkForest';
import { Arena, ArenaConfig, ArenaPlanet } from '../../generated/schema';
import { BigInt, dataSource, log } from '@graphprotocol/graph-ts';
import { bjjFieldElementToSignedInt, hexStringToPaddedUnprefixed, isDefenseBoosted, isEnergyCapBoosted, isEnergyGrowthBoosted, isRangeBoosted, isSpaceJunkHalved, isSpeedBoosted, toPlanetType, toSpaceType } from './converters';

/* 
  Standard id for arena: contract-id 
  ex Player: 0x124d0b48570adfd14ac35820e38db273caa6a694-0x1c0f0af3262a7213e59be7f1440282279d788335
*/
export function makeArenaId(contract: string, id: string): string {
  return `${contract}-${id}`;
}

export function buildConfig(
  arenaId: string,
  constants: DarkForest__getGraphConstantsResultValue0Struct
): ArenaConfig {
  const config = new ArenaConfig(arenaId);
  config.arena = arenaId;
  config.ABANDON_RANGE_CHANGE_PERCENT = constants.gc.ABANDON_SPEED_CHANGE_PERCENT.toI32();
  config.ABANDON_SPEED_CHANGE_PERCENT = constants.gc.ABANDON_SPEED_CHANGE_PERCENT.toI32();
  config.ADMIN_CAN_ADD_PLANETS = constants.gc.ADMIN_CAN_ADD_PLANETS;
  config.ARTIFACT_POINT_VALUES = constants.gc.ARTIFACT_POINT_VALUES.map<i32>((x) => x.toI32());
  config.BIOMEBASE_KEY = constants.sc.BIOMEBASE_KEY.toI32();
  config.BIOME_THRESHOLD_1 = constants.gc.BIOME_THRESHOLD_1.toI32();
  config.BIOME_THRESHOLD_2 = constants.gc.BIOME_THRESHOLD_2.toI32();
  config.CAPTURE_ZONES_ENABLED = constants.gc.CAPTURE_ZONES_ENABLED;
  config.CAPTURE_ZONES_PER_5000_WORLD_RADIUS =
    constants.gc.CAPTURE_ZONES_PER_5000_WORLD_RADIUS.toI32();
  config.CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL = constants.gc.CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL.toI32();
  config.CAPTURE_ZONE_COUNT = constants.gc.CAPTURE_ZONE_COUNT.toI32();
  config.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED = constants.gc.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED.toI32();
  config.CAPTURE_ZONE_PLANET_LEVEL_SCORE = constants.gc.CAPTURE_ZONE_PLANET_LEVEL_SCORE.map<i32>((x) => x.toI32());
  config.CAPTURE_ZONE_RADIUS = constants.gc.CAPTURE_ZONE_RADIUS.toI32();
  config.CLAIM_VICTORY_ENERGY_PERCENT = constants.ac.CLAIM_VICTORY_ENERGY_PERCENT.toI32();
  config.CONFIG_HASH = constants.ac.CONFIG_HASH;
  config.DISABLE_ZK_CHECKS = constants.sc.DISABLE_ZK_CHECKS;
  config.INIT_PERLIN_MAX = constants.gc.INIT_PERLIN_MAX.toI32();
  config.INIT_PERLIN_MIN = constants.gc.INIT_PERLIN_MIN.toI32();
  config.INIT_PLANET_HASHES = constants.ac.INIT_PLANET_HASHES;
  config.LOCATION_REVEAL_COOLDOWN = constants.gc.LOCATION_REVEAL_COOLDOWN.toI32();
  config.MANUAL_SPAWN = constants.ac.MANUAL_SPAWN;
  config.MAX_NATURAL_PLANET_LEVEL = constants.gc.MAX_NATURAL_PLANET_LEVEL.toI32();
  config.MODIFIERS = [
    constants.ac.MODIFIERS.popCap.toI32(),
    constants.ac.MODIFIERS.popGrowth.toI32(),
    constants.ac.MODIFIERS.silverCap.toI32(),
    constants.ac.MODIFIERS.silverGrowth.toI32(),
    constants.ac.MODIFIERS.range.toI32(),
    constants.ac.MODIFIERS.speed.toI32(),
    constants.ac.MODIFIERS.defense.toI32(),
    constants.ac.MODIFIERS.barbarianPercentage.toI32(),
  ];
  config.NO_ADMIN = constants.ac.NO_ADMIN;
  config.PERLIN_LENGTH_SCALE = constants.sc.PERLIN_LENGTH_SCALE.toI32();
  config.PERLIN_MIRROR_X = constants.sc.PERLIN_MIRROR_X;
  config.PERLIN_MIRROR_Y = constants.sc.PERLIN_MIRROR_Y;
  config.PERLIN_THRESHOLD_1 = constants.gc.PERLIN_THRESHOLD_1.toI32();
  config.PERLIN_THRESHOLD_2 = constants.gc.PERLIN_THRESHOLD_2.toI32();
  config.PERLIN_THRESHOLD_3 = constants.gc.PERLIN_THRESHOLD_3.toI32();
  config.PHOTOID_ACTIVATION_DELAY = constants.gc.PHOTOID_ACTIVATION_DELAY.toI32();
  // Good to here
  config.PLANETHASH_KEY = constants.sc.PLANETHASH_KEY.toI32();
  config.PLANET_LEVEL_JUNK = constants.gc.PLANET_LEVEL_JUNK.map<i32>((x) => x.toI32());
  config.PLANET_LEVEL_THRESHOLDS = constants.gc.PLANET_LEVEL_THRESHOLDS.map<i32>((x) => x.toI32());
  config.PLANET_RARITY = constants.gc.PLANET_RARITY.toI32();
  config.PLANET_TRANSFER_ENABLED = constants.gc.PLANET_TRANSFER_ENABLED;
  config.SILVER_SCORE_VALUE = constants.gc.SILVER_SCORE_VALUE.toI32();
  config.SPACESHIPS = [
    constants.ac.SPACESHIPS.mothership,
    constants.ac.SPACESHIPS.whale,
    constants.ac.SPACESHIPS.crescent,
    constants.ac.SPACESHIPS.gear,
    constants.ac.SPACESHIPS.titan,
  ];
  config.SPACETYPE_KEY = constants.sc.SPACETYPE_KEY.toI32();
  config.SPACE_JUNK_ENABLED = constants.gc.SPACE_JUNK_ENABLED;
  config.SPACE_JUNK_LIMIT = constants.gc.SPACE_JUNK_LIMIT.toI32();
  config.SPAWN_RIM_AREA = constants.gc.SPAWN_RIM_AREA.toI32();
  config.TARGET_PLANETS = constants.ac.TARGET_PLANETS;
  config.TIME_FACTOR_HUNDREDTHS = constants.gc.TIME_FACTOR_HUNDREDTHS.toI32();
  config.TOKEN_MINT_END_TIMESTAMP = constants.gc.TOKEN_MINT_END_TIMESTAMP; // Might be BigInt
  config.WORLD_RADIUS_LOCKED = constants.gc.WORLD_RADIUS_LOCKED;
  config.WORLD_RADIUS_MIN = constants.gc.WORLD_RADIUS_MIN.toI32();

  return config;
}

export function buildPlanet(contract: DarkForest, id: string, locationDec: BigInt): ArenaPlanet {

  const planetData = contract.bulkGetPlanetsDataByIds([locationDec])[0];
  const arenaData = contract.planetsArenaInfo(locationDec);
  const locationId = hexStringToPaddedUnprefixed(locationDec);
  
  const planet = new ArenaPlanet(id);
  planet.locationDec = locationDec;

  // Init planet might not always be revealed planet
  if (planetData.revealedCoords.x && planetData.revealedCoords.y) {
    planet.x = bjjFieldElementToSignedInt(planetData.revealedCoords.x);
    planet.y = bjjFieldElementToSignedInt(planetData.revealedCoords.y);
  }
  planet.perlin = planetData.info.perlin.toI32();
  planet.level = planetData.planet.planetLevel.toI32();
  planet.planetType = toPlanetType(planetData.planet.planetType);
  planet.targetPlanet = arenaData.targetPlanet;
  planet.spawnPlanet = arenaData.spawnPlanet;
  planet.winner = null;
  // These are useful for confirming that spawn planets are fair.
  planet.isEnergyCapBoosted = isEnergyCapBoosted(locationId);
  planet.isEnergyGrowthBoosted = isEnergyGrowthBoosted(locationId);
  planet.isRangeBoosted = isRangeBoosted(locationId);
  planet.isSpeedBoosted = isSpeedBoosted(locationId);
  planet.isDefenseBoosted = isDefenseBoosted(locationId);
  planet.isSpaceJunkHalved = isSpaceJunkHalved(locationId);
  planet.spaceType = toSpaceType(planetData.info.spaceType);

  let arena = Arena.load(contract._address.toHexString());

  if (!arena) {
    log.error('attempting to attach player to unkown arena: {}', [
      contract._address.toHexString(),
    ]);
    throw new Error();
  }
    
  planet.arena = arena.id;

  return planet;
}