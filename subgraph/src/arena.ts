import {
  DarkForest,
  Gameover,
  PlayerInitialized,
  LobbyCreated,
  GameStarted,
  DarkForest__getAllConstantsResultValue0Struct,
  AdminPlanetCreated,
  ArrivalQueued,
} from '../generated/DarkForest/DarkForest';
import { DarkForest as DFDiamond } from '../generated/templates';
import { Arena, ArenaPlayer, ArenaConfig, ArenaPlanet } from '../generated/schema';
import {
  bjjFieldElementToSignedInt,
  hexStringToPaddedUnprefixed,
  toPlanetType,
} from './helpers/converters';
import { dataSource, log, BigInt } from '@graphprotocol/graph-ts';
import { makeArenaId } from './helpers/utils';

function getId(id: string): string {
  return `${dataSource.address().toHexString()}-${id}`;
}

function buildConfig(
  id: string,
  constants: DarkForest__getAllConstantsResultValue0Struct
): ArenaConfig {
  const config = new ArenaConfig(id);
  config.ABANDON_RANGE_CHANGE_PERCENT = constants.ABANDON_SPEED_CHANGE_PERCENT.toI32();
  config.ABANDON_SPEED_CHANGE_PERCENT = constants.ABANDON_SPEED_CHANGE_PERCENT.toI32();
  config.ADMIN_CAN_ADD_PLANETS = constants.ADMIN_CAN_ADD_PLANETS;
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
  config.TOKEN_MINT_END_TIMESTAMP = constants.TOKEN_MINT_END_TIMESTAMP.toI32();
  config.WORLD_RADIUS_LOCKED = constants.WORLD_RADIUS_LOCKED;
  config.WORLD_RADIUS_MIN = constants.WORLD_RADIUS_MIN.toI32();

  return config;
}

/* This is for the generator contract */
export function handleLobbyCreated(event: LobbyCreated): void {
  /* new arena */
  const arena = new Arena(event.params.lobbyAddress.toHexString());

  const contract = DarkForest.bind(dataSource.address());

  arena.creator = event.params.ownerAddress.toHexString();
  arena.ownerAddress = contract.adminAddress().toHexString();
  arena.lobbyAddress = event.params.lobbyAddress.toHexString();
  arena.gameOver = false;

  arena.winners = new Array<string>();
  // These values are new additions to the Diamond, won't exist for original arenas

  let arenaConstantsResult = contract.try_getArenaConstants();
  if (arenaConstantsResult.reverted) {
    log.info('Arena Constants reverted', []);
  } else {
    arena.configHash = arenaConstantsResult.value.CONFIG_HASH;
  }

  let allConstantsResult = contract.try_getAllConstants();
  if (allConstantsResult.reverted) {
    log.info('All Constants reverted', []);
  } else {
    const config = buildConfig(arena.id, allConstantsResult.value);
    config.save();
    arena.config = config.id;
  }

  arena.creationTime = event.block.timestamp.toI32();
  // Note: this will be a problem if / when block.number > 2 billion
  arena.startBlock = event.block.number.toI32();

  arena.save();

  // /* new data source */
  DFDiamond.create(event.params.lobbyAddress);
}

export function handleGameStarted(event: GameStarted): void {
  let arena = Arena.load(dataSource.address().toHexString());
  if (arena) {
    arena.startTime = event.block.timestamp.toI32();
    const player = ArenaPlayer.load(getId(event.params.startPlayer.toHexString()));
    if (player) {
      arena.firstMover = player.id;
    }
    arena.save();
  } else {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }
}

export function handleGameover(event: Gameover): void {
  let arena = Arena.load(dataSource.address().toHexString());
  if (arena) {
    const contract = DarkForest.bind(dataSource.address());
    const duration = contract.getRoundDuration();
    let winners = arena.winners;
    winners.push(getId(event.params.winner.toHexString()));
    arena.winners = winners;
    arena.duration = duration.toI32();
    arena.gameOver = true;
    arena.save();

    // Eventually will be in a for loop for multiple winners
    const player = ArenaPlayer.load(getId(event.params.loc.toHexString()));
    if (player) {
      player.winner = true;
      player.save();
    }
  } else {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }

  const planet = ArenaPlanet.load(getId(hexStringToPaddedUnprefixed(event.params.loc)));
  if (planet) {
    planet.winner = true;
    planet.save();
  } else {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }
}

export function handlePlayerInitialized(event: PlayerInitialized): void {
  const locationDec = event.params.loc;
  const locationId = hexStringToPaddedUnprefixed(locationDec);
  const playerAddress = event.params.player.toHexString();
  const id = makeArenaId(dataSource.address().toHexString(), playerAddress);
  // addresses gets 0x prefixed and 0 padded in toHexString
  const player = new ArenaPlayer(id);
  player.initTimestamp = event.block.timestamp.toI32();
  player.address = playerAddress;
  player.winner = false;
  let arena = Arena.load(dataSource.address().toHexString());
  if (arena) {
    player.arena = arena.id;
    player.save();
  } else {
    log.error('attempting to attach player to unkown arena: {}', [
      dataSource.address().toHexString(),
    ]);
    throw new Error();
  }
}

export function handleAdminPlanetCreated(event: AdminPlanetCreated): void {
  const contract = DarkForest.bind(dataSource.address());
  const planetData = contract.bulkGetPlanetsDataByIds([event.params.loc])[0];
  const arenaData = contract.planetsArenaInfo(event.params.loc);

  const locationId = hexStringToPaddedUnprefixed(event.params.loc);

  // this preserves synthetic fields not found in the contract like hat and revealedCoordinate
  let planet = ArenaPlanet.load(getId(locationId));
  // Location has to be prefixed with arena address because planets will have same id.
  if (!planet) planet = new ArenaPlanet(getId(locationId));

  planet.locationDec = event.params.loc;
  planet.x = bjjFieldElementToSignedInt(planetData.revealedCoords.x);
  planet.y = bjjFieldElementToSignedInt(planetData.revealedCoords.y);
  planet.perlin = planetData.info.perlin.toI32();
  planet.level = planetData.planet.planetLevel.toI32();
  planet.planetType = toPlanetType(planetData.planet.planetType);
  planet.targetPlanet = arenaData.targetPlanet;
  planet.spawnPlanet = arenaData.spawnPlanet;
  planet.winner = false;

  let arena = Arena.load(dataSource.address().toHexString());
  if (arena) {
    planet.arena = arena.id;
    planet.save();
  } else {
    log.error('attempting to attach player to unkown arena: {}', [
      dataSource.address().toHexString(),
    ]);
    throw new Error();
  }
}

export function handleArrivalQueued(event: ArrivalQueued): void {
  const playerAddress = event.params.player.toHexString();

  const player = ArenaPlayer.load(getId(playerAddress));
  if (player) {
    player.moves = player.moves++;
    player.save();
  } else {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }
}
