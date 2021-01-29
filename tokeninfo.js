import { check } from 'k6';
import { wrapWithErrorCounting, Keycloak, getTestConfig, setupOpenSessions, pickRandom } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

export let options = {
  stages: [
    { duration: "20s", target: 5 },
    { duration: "2m", target: 300 }
  ],
};

const config = getTestConfig();

randomSeed(__VU);
let keycloak = new Keycloak(config.keycloakURL, { offlineTokens: config.offlineTokens });

export const setup = setupOpenSessions(keycloak, config.realmCount, config.sessionCount);

function testKCTokenInfo(mySessions) {
  let session = pickRandom(mySessions);
  keycloak.tokeninfo(session.realm.id, session.tokens, session.client, check);
}

export default wrapWithErrorCounting(testKCTokenInfo);
