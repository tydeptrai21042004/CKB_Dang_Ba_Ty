import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, parseCookies, sessionCookie, verifySessionToken } from "../src/lib/session-auth.js";

test("signed admin session cannot be modified",()=>{const secret="x".repeat(40);const token=createSessionToken({id:"u1",email:"a@example.com",role:"admin"},secret,60);assert.equal(verifySessionToken(token,secret).role,"admin");const changed=`${token.slice(0,-1)}${token.endsWith("a")?"b":"a"}`;assert.equal(verifySessionToken(changed,secret),null)});
test("session cookie is HttpOnly and Strict",()=>{const c=sessionCookie("abc",true);assert.match(c,/HttpOnly/);assert.match(c,/SameSite=Strict/);assert.match(c,/Secure/);assert.equal(parseCookies("a=1; ckbuilder_session=abc").ckbuilder_session,"abc")});
