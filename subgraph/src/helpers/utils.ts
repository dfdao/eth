/* 
  Standard id for arena: contract-id 
  ex Player: 0x124d0b48570adfd14ac35820e38db273caa6a694-0x1c0f0af3262a7213e59be7f1440282279d788335
*/
export function makeArenaId(contract: string, id: string): string {
  return `${contract}-${id}`
}