import assert from 'node:assert/strict';
import { test } from 'node:test';
import {createPokemonService} from '../services/pokemonService.js';
const poke=(name,id=25,species=name)=>({id,name,species:{name:species},sprites:{front_default:'https://example.com/a.png'},stats:[{stat:{name:'hp'},base_stat:35}],height:4,weight:60,types:[{type:{name:'electric'}}]});
const species=(name,id=25,form=name)=>({name,pokedex_numbers:[{pokedex:{name:'national'},entry_number:id}],varieties:[{is_default:true,pokemon:{name:form}}]});
const fail=(status,code)=>{throw Object.assign(new Error('Private upstream information'),{response:{status},code})};
function fixture(handler){const calls=[];return {calls,service:createPokemonService({async get(url){calls.push(url);const data=await handler(url,calls);return {data}}})}}
await test('cached name, number and concurrent requests share fetched data',async()=>{
 const f=fixture(async u=>u.startsWith('/pokemon-species')?species('pikachu'):poke('pikachu'));
 const a=await Promise.all([f.service.getPokemon('pikachu'),f.service.getPokemon('pikachu'),f.service.getPokemon('pikachu')]);
 assert.equal(f.calls.length,2);assert.equal(a[0].number,25);assert.equal(a[0].weight,6);
 await f.service.getPokemon('25');assert.equal(f.calls.length,2);
});
await test('cache expiry requests new data without extending lifetime on hits',async()=>{
 const f=fixture(u=>u.startsWith('/pokemon-species')?species('pikachu'):poke('pikachu'));
 const real=Date.now;let now=real();Date.now=()=>now;
 try{await f.service.getPokemon('pikachu');now+=19*60*1000;await f.service.getPokemon('pikachu');assert.equal(f.calls.length,2);now+=2*60*1000;await f.service.getPokemon('pikachu');assert.equal(f.calls.length,4)}finally{Date.now=real}
});
await test('default form aliases stay cached and use national number',async()=>{
 const f=fixture(u=>{if(u==='/pokemon/giratina')fail(404);return u.startsWith('/pokemon-species')?species('giratina',487,'giratina-origin'):poke('giratina-origin',10007,'giratina')});
 const p=await f.service.getPokemon('giratina');assert.equal(p.number,487);assert.equal(f.calls.length,3);
 await f.service.getPokemon('giratina');await f.service.getPokemon('10007');assert.equal(f.calls.length,3);
});
await test('timeouts, rate limiting, network failures and not found have safe messages; no fallback except 404',async()=>{
 for(const [status,code,expected] of [[429,null,503],[500,null,502],[null,'ECONNABORTED',504],[null,'ETIMEDOUT',504],[null,'ENOTFOUND',502],[404,null,404]]){
  const f=fixture(()=>fail(status,code));await assert.rejects(f.service.getPokemon('pikachu'),e=>e.status===expected&&!e.publicMessage.includes('Private'));
  assert.equal(f.calls.length,status===404?2:1);
 }
});
await test('failed pending requests are cleared so retry can succeed',async()=>{
 let broken=true;const f=fixture(u=>{if(broken)fail(503);return u.startsWith('/pokemon-species')?species('pikachu'):poke('pikachu')});
 const result=await Promise.allSettled([f.service.getPokemon('pikachu'),f.service.getPokemon('pikachu')]);assert.ok(result.every(x=>x.status==='rejected'));assert.equal(f.calls.length,1);
 broken=false;await f.service.getPokemon('pikachu');assert.equal(f.calls.length,3);
});
await test('malformed Pokémon and species are not cached',async()=>{
 for(const badPart of ['pokemon','species']){
 let broken=true;const f=fixture(u=>{const isSpecies=u.startsWith('/pokemon-species');if(broken&&((badPart==='species')===isSpecies))return {};return isSpecies?species('pikachu'):poke('pikachu')});
 await assert.rejects(f.service.getPokemon('pikachu'),e=>e.status===502);broken=false;await f.service.getPokemon('pikachu');
 assert.equal(f.calls.filter(u=>u.startsWith(badPart==='species'?'/pokemon-species/':'/pokemon/')).length,2);
 }
});
await test('partial catalog keeps valid cards and retries only failed data',async()=>{
 let broken=true;const f=fixture(u=>{
 if(u.includes('?'))return {count:2,results:[{name:'pikachu'},{name:'eevee'}]};
 const name=u.split('/').pop();if(name==='eevee'&&broken)fail(503);
 return u.startsWith('/pokemon-species')?species(name,name==='pikachu'?25:133):poke(name,name==='pikachu'?25:133);
 });
 const first=await f.service.getCatalog();assert.equal(first.pokemon.length,1);assert.equal(first.unavailable,1);assert.equal(first.total,2);assert.equal(first.hasNext,false);
 const n=f.calls.length;broken=false;const next=await f.service.getCatalog();assert.equal(next.pokemon.length,2);assert.equal(next.unavailable,0);assert.equal(f.calls.length-n,2);
 await f.service.getPokemon('pikachu');assert.equal(f.calls.length-n,2);
});
await test('all cards failing produces an error and can recover',async()=>{
 let broken=true;const f=fixture(u=>{if(u.includes('?'))return {count:1,results:[{name:'pikachu'}]};if(broken)fail(429);return u.startsWith('/pokemon-species')?species('pikachu'):poke('pikachu')});
 await assert.rejects(f.service.getCatalog(),e=>e.status===503);broken=false;assert.equal((await f.service.getCatalog()).pokemon.length,1);
});
await test('malformed list recovery, empty catalog and out of range',async()=>{
 let data={count:12,results:[]};const f=fixture(()=>data);
 await assert.rejects(f.service.getCatalog(),e=>e.status===502);data={count:0,results:[]};const empty=await f.service.getCatalog();assert.equal(empty.totalPages,1);assert.equal(empty.unavailable,0);
 await assert.rejects(f.service.getCatalog(2),e=>e.status===404);
});
await test('invalid identifiers rejected before requests',async()=>{
 const f=fixture(()=>{});for(const value of ['../x',null,['a'],'a/b'])await assert.rejects(f.service.getPokemon(value),e=>e.status===400);
 for(const value of [0,-1,1.5,10000,'2'])await assert.rejects(f.service.getCatalog(value),e=>e.status===400);assert.equal(f.calls.length,0);
});
await test('bounded cache evicts old keys',async()=>{
 const f=fixture(u=>{const name=u.split('/').pop();const id=Number(name.split('-')[1]);return u.startsWith('/pokemon-species')?species(name,id):poke(name,id)});
 for(let n=1;n<=80;n++)await f.service.getPokemon(`poke-${n}`);
 const count=f.calls.length;await f.service.getPokemon('poke-1');assert.equal(f.calls.length,count+2);
});

