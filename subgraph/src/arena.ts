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
  TargetCaptured,
} from '../generated/DarkForest/DarkForest';
import {
  Arena,
  ArenaConfig,
  ArenaPlanet,
  ArenaPlayer,
  ConfigPlayer,
  Player,
} from '../generated/schema';
import { hexStringToPaddedUnprefixed } from './helpers/converters';
import { Bytes, dataSource, log } from '@graphprotocol/graph-ts';
import {
  arenaId,
  buildPlanet,
  configPlayerId,
  loadArena,
  loadArenaConfig,
  loadArenaConstants,
  loadArenaPlanet,
  loadArenaPlayer,
  loadGraphConstants,
  loadPlayer,
  loadWinners,
} from './helpers/utils';
import { DarkForest as DFDiamond } from '../generated/templates';
import { buildConfig } from './helpers/utils';
import { updateElo } from './helpers/elo';
import { DEFAULT_ELO } from './helpers/constants';

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
  const arena = loadArena(dataSource.address().toHexString());

  arena.owner = event.params.ownerAddress.toHexString();

  const arenaConstantsResult = loadArenaConstants();
  arena.configHash = arenaConstantsResult.CONFIG_HASH;

  const graphConstants = loadGraphConstants();
  const config = buildConfig(arena.id, graphConstants);
  config.save();
  arena.config = config.id;
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

  let arena = loadArena(dataSource.address().toHexString());

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
 * @param event TargetCaptured
 * Creates or updates:
 * ArenaPlanet
 */
export function handleTargetCaptured(event: TargetCaptured): void {
  const targetId = hexStringToPaddedUnprefixed(event.params.loc);
  const planet = loadArenaPlanet(arenaId(targetId));
  const player = loadArenaPlayer(arenaId(event.params.player.toHexString()))
  planet.captured = true;
  planet.capturer = player.id;
  planet.save();
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
  const arena = loadArena(dataSource.address().toHexString());

  const winnerAddress = event.params.winner.toHexString();

  // Every ArenaPlayer and Player gets updated
  // ConfigPlayer or ConfigTeam gets updated with ELO
  const winners = loadWinners().map<string>(x => x.toHexString());
  winners.forEach(winner => {
    const winningPlayer = loadArenaPlayer(arenaId(winner));
    const aggregatePlayer = loadPlayer(winner);

    aggregatePlayer.wins = aggregatePlayer.wins + 1;
    aggregatePlayer.save();

    winningPlayer.winner = true;
    winningPlayer.save();
  })

  arena.gameOver = true;
  arena.endTime = event.block.timestamp.toI32();
  // Edge case: If you win a match, but haven't made a move, duration is startTime is creationTime.
  if (arena.startTime) arena.duration = arena.endTime - arena.startTime;
  
  arena.winners = winners.map<string>(playerId => arenaId(playerId));
  arena.save();

  //TODO: Add teams here for more general logic
  const config = loadArenaConfig(arena.id);
  if (config.RANKED && !config.TEAMS_ENABLED && arena.players.length == 2) {
    const aP1 = ArenaPlayer.load(arena.players[0]);
    const aP2 = ArenaPlayer.load(arena.players[1]);
    if (aP1 && aP2) {
      updatePlayerElo(arena.configHash.toHexString(), aP1.address, aP2.address, winnerAddress);
    }
  }

}

/**
 * @param event GameStarted
 * Creates or updates:
 * Arena
 */
export function handleGameStarted(event: GameStarted): void {
  const arena = loadArena(dataSource.address().toHexString());
  const player = loadArenaPlayer(arenaId(event.params.startPlayer.toHexString()));

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

  const player = loadArenaPlayer(arenaId(playerAddress));

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

  const player = loadArenaPlayer(arenaId(playerAddress));

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

  const player = loadArenaPlayer(arenaId(playerAddress));

  player.ready = false;
  player.save();
}
