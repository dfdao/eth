import { DarkForest, DarkForest__getAllConstantsResultValue0Struct } from '../../generated/DarkForest/DarkForest';
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
  constants: DarkForest__getAllConstantsResultValue0Struct
): ArenaConfig {
  const config = new ArenaConfig(arenaId);
  config.arena = arenaId;
  config.ABANDON_RANGE_CHANGE_PERCENT = constants.ABANDON_SPEED_CHANGE_PERCENT.toI32();
  config.ABANDON_SPEED_CHANGE_PERCENT = constants.ABANDON_SPEED_CHANGE_PERCENT.toI32();
  config.ADMIN_CAN_ADD_PLANETS = constants.ADMIN_CAN_ADD_PLANETS;
  // Good to here
  config.ARTIFACT_POINT_VALUES = constants.ARTIFACT_POINT_VALUES.map<i32>((x) => x.toI32());
  config.BIOMEBASE_KEY = constants.BIOMEBASE_KEY.toI32();
  config.BIOME_THRESHOLD_1 = constants.BIOME_THRESHOLD_1.toI32();
  config.BIOME_THRESHOLD_2 = constants.BIOME_THRESHOLD_2.toI32();
  config.CAPTURE_ZONES_ENABLED = constants.CAPTURE_ZONES_ENABLED;
  config.CAPTURE_ZONES_PER_5000_WORLD_RADIUS =
    constants.CAPTURE_ZONES_PER_5000_WORLD_RADIUS.toI32();
  config.CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL = constants.CAPTURE_ZONE_CHANGE_BLOCK_INTERVAL.toI32();
  config.CAPTURE_ZONE_COUNT = constants.CAPTURE_ZONE_COUNT.toI32();
  config.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED = constants.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED.toI32();
  config.CAPTURE_ZONE_RADIUS = constants.CAPTURE_ZONE_RADIUS.toI32();
  config.CLAIM_VICTORY_ENERGY_PERCENT = constants.CLAIM_VICTORY_ENERGY_PERCENT.toI32();
  config.DISABLE_ZK_CHECKS = constants.DISABLE_ZK_CHECKS;
  config.INIT_PERLIN_MAX = constants.INIT_PERLIN_MAX.toI32();
  config.INIT_PERLIN_MIN = constants.INIT_PERLIN_MIN.toI32();
  config.INIT_PLANET_HASHES = constants.INIT_PLANET_HASHES;
  config.LOCATION_REVEAL_COOLDOWN = constants.LOCATION_REVEAL_COOLDOWN.toI32();
  config.MANUAL_SPAWN = constants.MANUAL_SPAWN;
  config.MAX_NATURAL_PLANET_LEVEL = constants.MAX_NATURAL_PLANET_LEVEL.toI32();
  // Good to here
  config.MODIFIERS = [
    constants.MODIFIERS.popCap.toI32(),
    constants.MODIFIERS.popGrowth.toI32(),
    constants.MODIFIERS.silverCap.toI32(),
    constants.MODIFIERS.silverGrowth.toI32(),
    constants.MODIFIERS.range.toI32(),
    constants.MODIFIERS.speed.toI32(),
    constants.MODIFIERS.defense.toI32(),
    constants.MODIFIERS.barbarianPercentage.toI32(),
  ];
  config.NO_ADMIN = constants.NO_ADMIN;
  config.PERLIN_LENGTH_SCALE = constants.PERLIN_LENGTH_SCALE.toI32();
  config.PERLIN_MIRROR_X = constants.PERLIN_MIRROR_X;
  config.PERLIN_MIRROR_Y = constants.PERLIN_MIRROR_Y;
  config.PERLIN_THRESHOLD_1 = constants.PERLIN_THRESHOLD_1.toI32();
  config.PERLIN_THRESHOLD_2 = constants.PERLIN_THRESHOLD_2.toI32();
  config.PERLIN_THRESHOLD_3 = constants.PERLIN_THRESHOLD_3.toI32();
  config.PHOTOID_ACTIVATION_DELAY = constants.PHOTOID_ACTIVATION_DELAY.toI32();
  // Good to here
  config.PLANETHASH_KEY = constants.PLANETHASH_KEY.toI32();
  config.PLANET_LEVEL_JUNK = constants.PLANET_LEVEL_JUNK.map<i32>((x) => x.toI32());
  config.PLANET_LEVEL_THRESHOLDS = constants.PLANET_LEVEL_THRESHOLDS.map<i32>((x) => x.toI32());
  config.PLANET_RARITY = constants.PLANET_RARITY.toI32();
  config.PLANET_TRANSFER_ENABLED = constants.PLANET_TRANSFER_ENABLED;
  config.SILVER_SCORE_VALUE = constants.SILVER_SCORE_VALUE.toI32();
  config.SPACESHIPS = [
    constants.SPACESHIPS.mothership,
    constants.SPACESHIPS.whale,
    constants.SPACESHIPS.crescent,
    constants.SPACESHIPS.gear,
    constants.SPACESHIPS.titan,
  ];
  config.SPACETYPE_KEY = constants.SPACETYPE_KEY.toI32();
  config.SPACE_JUNK_ENABLED = constants.SPACE_JUNK_ENABLED;
  config.SPACE_JUNK_LIMIT = constants.SPACE_JUNK_LIMIT.toI32();
  config.SPAWN_RIM_AREA = constants.SPAWN_RIM_AREA.toI32();
  config.TARGET_PLANETS = constants.TARGET_PLANETS;
  config.TIME_FACTOR_HUNDREDTHS = constants.TIME_FACTOR_HUNDREDTHS.toI32();
  config.TOKEN_MINT_END_TIMESTAMP = constants.TOKEN_MINT_END_TIMESTAMP; // Might be BigInt
  config.WORLD_RADIUS_LOCKED = constants.WORLD_RADIUS_LOCKED;
  config.WORLD_RADIUS_MIN = constants.WORLD_RADIUS_MIN.toI32();

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