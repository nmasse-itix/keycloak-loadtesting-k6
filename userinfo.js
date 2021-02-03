import { check } from 'k6';
import { wrapWithErrorCounting, Keycloak, getTestConfig, setupOpenSessions, pickRandom } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

const config = getTestConfig();

export let options = {
  stages: [
    { duration: config.rampupDuration, target: config.vuCount },
    { duration: config.testDuration, target: config.vuCount },
    { duration: config.rampupDuration, target: 0 },
  ],
  setupTimeout: config.setupTimeout,
};

randomSeed(__VU);
let keycloak = new Keycloak(config.keycloakURL, { offlineTokens: config.offlineTokens });

export const setup = setupOpenSessions(keycloak, config.realmCount, config.sessionCount);

function testKCUserInfo(mySessions) {
  let session = pickRandom(mySessions);
  keycloak.userinfo(session.realm.id, session.tokens, check);
}

export default wrapWithErrorCounting(testKCUserInfo);
