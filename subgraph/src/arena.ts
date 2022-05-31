import { DarkForest, Gameover, PlayerInitialized, LobbyCreated, GameStarted } from "../generated/DarkForest/DarkForest";
import { DarkForest as DFDiamond } from '../generated/templates'
import { Arena, ArenaPlayer } from "../generated/schema";
import { hexStringToPaddedUnprefixed } from "./helpers/converters";
import { dataSource, log } from '@graphprotocol/graph-ts';
import { makeArenaId } from "./helpers/utils";

function getId(id: string):string {
  return `${dataSource.address().toHexString()}-${id}`
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

  arena.winners = new Array<string>()
  arena.configHash = contract.getArenaConstants().CONFIG_HASH;
  arena.creationTime = event.block.timestamp;
  arena.startBlock = event.block.number;
  arena.save();

  // /* new data source */ 
  DFDiamond.create(event.params.lobbyAddress)  
} 

export function handleGameStarted(event: GameStarted): void {
  let arena = Arena.load(dataSource.address().toHexString());
  if (arena) {
    arena.startTime = event.block.timestamp;
    const player = ArenaPlayer.load(getId(event.params.startPlayer.toHexString()));
    if(player) {
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
    let winners = arena.winners
    winners.push(getId(event.params.winner.toHexString()));
    arena.winners = winners;
    arena.duration = duration;
    arena.gameOver = true;
    arena.save()

    // Eventually will be in a for loop for multiple winners
    const player = ArenaPlayer.load(getId(event.params.winner.toHexString()));
    if(player) {
      player.winner = true;
      player.save();
    }

  } else {
    log.error('attempting to load unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  } 
} 

export function handlePlayerInitialized(event: PlayerInitialized): void {
  const locationDec = event.params.loc;
  const locationId = hexStringToPaddedUnprefixed(locationDec);
  const playerAddress = event.params.player.toHexString();
  const id = makeArenaId(dataSource.address().toHexString(), playerAddress)
  // addresses gets 0x prefixed and 0 padded in toHexString
  const player = new ArenaPlayer(id);
  player.initTimestamp = event.block.timestamp.toI32();
  player.address = playerAddress;
  player.winner = false;
  let arena = Arena.load(dataSource.address().toHexString());
  if (arena) {
    player.arena = arena.id;
    player.save()
  } else {
    log.error('attempting to attach player to unkown arena: {}', [dataSource.address().toHexString()]);
    throw new Error();
  } 
}