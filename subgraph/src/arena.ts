import {
  AdminPlanetCreated,
  ArenaInitialized,
  ArrivalQueued,
  DarkForest,
  Gameover,
  GameStarted,
  LobbyCreated,
  PlayerInitialized,
  PlayerNotReady,
  PlayerReady,
} from '../generated/DarkForest/DarkForest';
import { Arena, ArenaPlanet, ArenaPlayer, ConfigPlayer, Player } from '../generated/schema';
import { hexStringToPaddedUnprefixed } from './helpers/converters';
import { Bytes, dataSource, log } from '@graphprotocol/graph-ts';
import { buildPlanet, makeArenaId } from './helpers/utils';
import { DarkForest as DFDiamond } from '../generated/templates';
import { buildConfig } from './helpers/utils';
import { updateElo } from './helpers/elo';
import { DEFAULT_ELO } from './helpers/constants';

function arenaId(id: string): string {
  return `${dataSource.address().toHexString()}-${id}`;
}

function configPlayerId(player: string, configHash: string): string {
  return `${player}-${configHash}`;
}

function updatePlayerElo(configHash: string, p1Id: string, p2Id: string, winner: string): void {

  let p1 = ConfigPlayer.load(configPlayerId(p1Id, configHash));
  let p2 = ConfigPlayer.load(configPlayerId(p2Id, configHash));
  if (p1 && p2) {
    const p1Win = p1.address == winner;
    const newElo = updateElo(p1.elo, p2.elo, p1Win);
    const p1NewRating = newElo[0];
    const p2NewRating = newElo[1];
    p1.elo = p1NewRating as i32;
    p2.elo = p2NewRating as i32;
    p1.gamesFinished += p1.gamesFinished + 1;
    p2.gamesFinished += p2.gamesFinished + 1;

    if (p1Win) {
      p1.wins = p1.wins + 1;
      p2.losses = p2.losses + 1;
    } else {
      p1.losses = p1.losses + 1;
      p2.wins = p2.wins + 1;
    }
    p1.save();
    p2.save();
  }
}

/**
 * @param event LobbyCreated
 * Creates or updates:
 * Arena
 * new Data Source via template
 */
export function handleLobbyCreated(event: LobbyCreated): void {
  const arena = new Arena(event.params.lobbyAddress.toHexString());
  arena.lobbyAddress = event.params.lobbyAddress.toHexString();
  arena.gameOver = false;
  arena.startTime = event.block.timestamp.toI32();
  arena.creator = event.params.creatorAddress.toHexString();
  arena.winners = new Array<string>();
  arena.players = new Array<string>();
  arena.configHash = Bytes.fromHexString('0x00');
  arena.creationTime = event.block.timestamp.toI32();

  // Note: this will be a problem if / when block.number > 2 billion
  arena.creationBlock = event.block.number.toI32();

  arena.save();

  /* new data source */
  DFDiamond.create(event.params.lobbyAddress);
}

/**
 * @param event ArenaInitialized
 * Creates or updates:
 * Arena
 * ArenaConfig
 */
export function handleArenaInitialized(event: ArenaInitialized): void {
  let arena = Arena.load(dataSource.address().toHexString());
  if (!arena) {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }
  const contract = DarkForest.bind(dataSource.address());

  arena.owner = event.params.ownerAddress.toHexString();

  let arenaConstantsResult = contract.try_getArenaConstants();
  if (arenaConstantsResult.reverted) {
    log.info('Arena Constants reverted', []);
  } else {
    const configHash = arenaConstantsResult.value.CONFIG_HASH;
    arena.configHash = configHash;
    log.info('config hash {}', [arena.configHash.toHexString()]);
  }

  let allConstantsResult = contract.try_getGraphConstants();
  if (allConstantsResult.reverted) {
    log.info('All Constants reverted', []);
  } else {
    const config = buildConfig(arena.id, allConstantsResult.value);
    config.save();
    arena.config = config.id;
  }
  arena.save();
}

/**
 * @param event  PlayerInitialized
 * Creates or updates:
 * ArenaPlayer
 * ConfigPlayer
 * Player (aggregate)
 * Arena
 */
export function handlePlayerInitialized(event: PlayerInitialized): void {
  const playerAddress = event.params.player.toHexString();

  const player = new ArenaPlayer(arenaId(playerAddress));
  player.initTimestamp = event.block.timestamp.toI32();
  player.address = playerAddress;
  player.winner = false;
  player.moves = 0;
  player.ready = false;
  player.lastMoveTime = event.block.timestamp.toI32();
  let arena = Arena.load(dataSource.address().toHexString());
  if (!arena) {
    log.error('attempting to attach player to unkown arena: {}', [
      dataSource.address().toHexString(),
    ]);
    throw new Error();
  }

  // Aggregate Entity
  let aggregatePlayer = Player.load(playerAddress);
  if (!aggregatePlayer) {
    aggregatePlayer = new Player(playerAddress);
    aggregatePlayer.wins = 0;
    aggregatePlayer.matches = 0;
  }
  aggregatePlayer.matches = aggregatePlayer.matches + 1;
  aggregatePlayer.save();

  if (arena.configHash) {
    const id = configPlayerId(playerAddress, arena.configHash.toHexString());
    let configPlayer = ConfigPlayer.load(id);
    if (!configPlayer) {
      configPlayer = new ConfigPlayer(id);
      configPlayer.address = playerAddress;
      configPlayer.elo = DEFAULT_ELO;
      configPlayer.gamesFinished = 0;
      configPlayer.gamesStarted = 0;
      configPlayer.wins = 0;
      configPlayer.losses = 0;
      configPlayer.configHash = arena.configHash;
      configPlayer.player = aggregatePlayer.id;
    }
    configPlayer.gamesStarted = configPlayer.gamesStarted + 1;
    configPlayer.save();
  }

  const players = arena.players.map<string>((x) => x);
  players.push(arenaId(playerAddress));
  arena.players = players;
  arena.save();

  player.arena = arena.id;
  player.player = aggregatePlayer.id;
  player.save();
}

/**
 * @param event GameOver
 * Creates or updates:
  * Arena
  * ArenaPlayer
  * ArenaPlanet
  * Player (aggregate)
  * ConfigPlayer (aggreagte) elo
 */
export function handleGameover(event: Gameover): void {
  let arena = Arena.load(dataSource.address().toHexString());
  if (!arena) {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }
  const winnerAddress = event.params.winner.toHexString();
  const targetId = hexStringToPaddedUnprefixed(event.params.loc);

  let winners = arena.winners;
  winners.push(arenaId(winnerAddress));
  arena.winners = winners;
  arena.gameOver = true;
  arena.endTime = event.block.timestamp.toI32();
  // Edge case: If you win a match, but haven't made a move, duration is startTime is creationTime.
  if (arena.startTime) arena.duration = arena.endTime - arena.startTime;

  arena.save();

  // Eventually will be in a for loop for multiple winners
  const player = ArenaPlayer.load(arenaId(winnerAddress));
  const planet = ArenaPlanet.load(arenaId(targetId));
  const aggregatePlayer = Player.load(winnerAddress);
  if (!player) {
    log.error('attempting to load unkown ArenaPlayer: {}', [arenaId(targetId)]);
    throw new Error();
  }
  if (!aggregatePlayer) {
    log.error('attempting to load unkown AggPlayer: {}', [event.params.winner.toHexString()]);
    throw new Error();
  }
  if (!planet) {
    log.error('attempting to load unkown planet: {}', [targetId]);
    throw new Error();
  }

  aggregatePlayer.wins = aggregatePlayer.wins + 1;
  aggregatePlayer.save();

  player.winner = true;
  player.save();

  //TODO: Add teams here for more general logic
  if (arena.players.length == 2) {
    const aP1 = ArenaPlayer.load(arena.players[0]);
    const aP2 = ArenaPlayer.load(arena.players[1]);
    if(aP1 && aP2) {
      updatePlayerElo(arena.configHash.toHexString(), aP1.address, aP2.address, winnerAddress)
    }
  }

  planet.winner = player.id;
  planet.save();
}


/**
 * @param event GameStarted 
 * Creates or updates:
 * Arena
 */
export function handleGameStarted(event: GameStarted): void {
  let arena = Arena.load(dataSource.address().toHexString());
  const player = ArenaPlayer.load(arenaId(event.params.startPlayer.toHexString()));
  if (!arena || !player) {
    log.error('attempting to load unkown arena or player: {}', [
      dataSource.address().toHexString(),
    ]);
    throw new Error();
  }
  arena.startTime = event.block.timestamp.toI32();
  arena.firstMover = player.id;

  arena.save();
}

/**
 * @param event Admin Planet Created
 * Creates or updates:
 * ArenaPlanet
 */
export function handleAdminPlanetCreated(event: AdminPlanetCreated): void {
  const contract = DarkForest.bind(dataSource.address());
  const id = arenaId(hexStringToPaddedUnprefixed(event.params.loc));

  const planet = buildPlanet(contract, id, event.params.loc);
  planet.save();
}

/**
 * @param event ArrivalQueued
 * Creates or updates
 * ArenaPlayer
 */
export function handleArrivalQueued(event: ArrivalQueued): void {
  const playerAddress = event.params.player.toHexString();

  const player = ArenaPlayer.load(arenaId(playerAddress));
  if (!player) {
    log.error('attempting to load unkown player: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }

  player.moves = player.moves + 1;
  player.lastMoveTime = event.block.timestamp.toI32();
  player.save();
}

/**
 * @param event PlayerReady
 * Creates or updates
 * ArenaPlayer
 */
 export function handlePlayerReady(event: PlayerReady): void {
  const playerAddress = event.params.player.toHexString();

  const player = ArenaPlayer.load(arenaId(playerAddress));
  if (!player) {
    log.error('attempting to load unkown player: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }

  player.ready = true;
  player.lastReadyTime = event.block.timestamp.toI32();
  player.save();
}

/**
 * @param event PlayerNotReady
 * Creates or updates
 * ArenaPlayer
 */
export function handlePlayerNotReady(event: PlayerNotReady): void {
  const playerAddress = event.params.player.toHexString();

  const player = ArenaPlayer.load(arenaId(playerAddress));
  if (!player) {
    log.error('attempting to load unkown player: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }

  player.ready = false;
  player.save();
}