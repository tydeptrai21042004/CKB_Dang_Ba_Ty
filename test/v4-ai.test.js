import assert from "node:assert/strict";
import test from "node:test";
import { aiProviderCatalog, buildAiRequest, callOptionalAi, parseAiResponse } from "../src/lib/ai-service.js";

test("v4 BYOK catalog includes Gemini without any API key",()=>{const c=aiProviderCatalog();assert.ok(c.some(x=>x.id==="gemini"));assert.equal(JSON.stringify(c).includes("apiKey"),false);});

test("v4 Gemini request uses x-goog-api-key and generateContent",()=>{const p={id:"gemini",name:"Google Gemini",kind:"gemini",endpoint:"https://generativelanguage.googleapis.com/v1beta/models",model:"gemini-3.7-flash"};const r=buildAiRequest(p,"secret","gemini-3.7-flash",[{role:"system",content:"system"},{role:"user",content:"hello"}],0.2);assert.match(r.url,/gemini-3.7-flash:generateContent$/);assert.equal(r.headers["x-goog-api-key"],"secret");assert.equal(r.body.systemInstruction.parts[0].text,"system");assert.equal(r.body.contents[0].parts[0].text,"hello");});

test("v4 Gemini parser joins text parts",()=>{const p={kind:"gemini"};assert.equal(parseAiResponse(p,{candidates:[{content:{parts:[{text:"one"},{text:"two"}]}}]}),"one\ntwo");});

test("v4 OpenAI-compatible parser remains backward compatible",()=>{assert.equal(parseAiResponse({kind:"openai-compatible"},{choices:[{message:{content:"ok"}}]}),"ok");});

test("v4 optional AI still requires a user supplied key",async()=>{await assert.rejects(()=>callOptionalAi({headers:{"x-ai-provider":"gemini"},messages:[{role:"user",content:"x"}]}),e=>e.code==="AI_API_KEY_REQUIRED");});

test("v4 Gemini call can be tested without network and does not persist key",async()=>{let captured;const fetchImpl=async(url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:"answer"}]}}]})}};const r=await callOptionalAi({headers:{"x-ai-provider":"gemini","x-ai-api-key":"user-key","x-ai-model":"gemini-3.7-flash"},messages:[{role:"user",content:"hello"}],fetchImpl});assert.equal(r.text,"answer");assert.equal(captured.options.headers["x-goog-api-key"],"user-key");assert.equal(JSON.stringify(r).includes("user-key"),false);});
