import { DarkForest, Gameover, PlayerInitialized } from "../generated/DarkForest/DarkForest";
import { Arena, ArenaPlayer, Player } from "../generated/schema";
import { hexStringToPaddedUnprefixed } from "./helpers/converters";
import { Address, dataSource, log } from '@graphprotocol/graph-ts';
import { makeArenaId } from "./helpers/utils";

function getId(id: string):string {
  return `${dataSource.address().toHexString()}-${id}`
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