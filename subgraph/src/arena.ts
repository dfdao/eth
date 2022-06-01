import {
  AdminPlanetCreated,
  ArrivalQueued,
  DarkForest,
  Gameover,
  GameStarted,
  LobbyCreated,
  PlayerInitialized,
} from '../generated/DarkForest/DarkForest';
import { Arena, ArenaPlanet, ArenaPlayer, Player } from '../generated/schema';
import { hexStringToPaddedUnprefixed } from './helpers/converters';
import { Address, dataSource, log } from '@graphprotocol/graph-ts';
import { buildPlanet, makeArenaId } from './helpers/utils';
import { DarkForest as DFDiamond } from '../generated/templates';
import { buildConfig } from './helpers/utils';

function arenaId(id: string): string {
  return `${dataSource.address().toHexString()}-${id}`;
}

export function handleLobbyCreated(event: LobbyCreated): void {
  const arena = new Arena(event.params.lobbyAddress.toHexString());
  arena.ownerAddress = event.params.ownerAddress.toHexString();
  arena.lobbyAddress = event.params.lobbyAddress.toHexString();
  arena.gameOver = false;
  arena.creator = event.params.ownerAddress.toHexString();
  arena.winners = new Array<string>();
 
  const contract = DarkForest.bind(event.params.lobbyAddress);

  let arenaOwnerResult = contract.try_owner();
  if (arenaOwnerResult.reverted) {
    log.info('Owner reverted', []);
  } else {
    arena.ownerAddress = arenaOwnerResult.value.toHexString();
  }

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
  arena.creationBlock = event.block.number.toI32();

  arena.save();

  /* new data source */
  DFDiamond.create(event.params.lobbyAddress);
}

export function handleGameover(event: Gameover): void {
  let arena = Arena.load(dataSource.address().toHexString());
  if (!arena) {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }

  let winners = arena.winners;
  winners.push(arenaId(event.params.winner.toHexString()));
  arena.winners = winners;
  arena.gameOver = true;
  arena.endTime = event.block.timestamp.toI32();

  // Edge case: If you win a match, but haven't made a move, duration is creationTime - endTime.
  const start = arena.startTime == 0 ? arena.creationTime : arena.startTime;
  arena.duration = arena.endTime - start;

  arena.save();

  // Eventually will be in a for loop for multiple winners
  const player = ArenaPlayer.load(arenaId(event.params.winner.toHexString()));
  const planet = ArenaPlanet.load(arenaId(hexStringToPaddedUnprefixed(event.params.loc)));
  const aggregatePlayer = Player.load(event.params.winner.toHexString());
  if (!player) {
    log.error('attempting to load unkown ArenaPlayer: {}', [arenaId(hexStringToPaddedUnprefixed(event.params.loc))]);
    throw new Error();
  }
  if(!aggregatePlayer) {
    log.error('attempting to load unkown AggPlayer: {}', [event.params.winner.toHexString()]);
    throw new Error();
  }

  aggregatePlayer.wins = aggregatePlayer.wins + 1;
  aggregatePlayer.save();

  player.winner = true;
  player.save();

  if (!planet) {
    log.error('attempting to load unkown planet: {}', [
      hexStringToPaddedUnprefixed(event.params.loc),
    ]);
    throw new Error();
  }

  planet.winner = player.id;
  planet.save();
}

export function handlePlayerInitialized(event: PlayerInitialized): void {
  const locationDec = event.params.loc;
  const locationId = hexStringToPaddedUnprefixed(locationDec);
  const playerAddress = event.params.player.toHexString();

  // const id = makeArenaId(dataSource.address().toHexString(), playerAddress)
  // addresses gets 0x prefixed and 0 padded in toHexString
  const player = new ArenaPlayer(arenaId(playerAddress));
  player.initTimestamp = event.block.timestamp.toI32();
  player.address = playerAddress;
  player.winner = false;
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

  player.arena = arena.id;
  player.player = aggregatePlayer.id;
  player.save();
}

// Update the Arena start time and firstMover
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

export function handleAdminPlanetCreated(event: AdminPlanetCreated): void {
  const contract = DarkForest.bind(dataSource.address());
  const id = arenaId(hexStringToPaddedUnprefixed(event.params.loc));

  const planet = buildPlanet(contract, id, event.params.loc);
  planet.save();
}

// Update the ArenaPlayer move count
export function handleArrivalQueued(event: ArrivalQueued): void {
  const playerAddress = event.params.player.toHexString();

  const player = ArenaPlayer.load(arenaId(playerAddress));
  if (!player) {
    log.error('attempting to load unkown player: {}', [dataSource.address().toHexString()]);
    throw new Error();
  }

  player.moves = player.moves + 1;
  player.save();
}
