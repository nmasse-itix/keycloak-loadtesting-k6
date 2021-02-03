import { check, sleep } from 'k6';
import { wrapWithErrorCounting, shuffleArray, getTestConfig, setupOpenSessions, Keycloak } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

const config = getTestConfig();

export let options = {
  stages: [
    { duration: config.rampupDuration, target: config.vuCount },
    { duration: config.testDuration, target: config.vuCount },
    { duration: config.rampupDuration, target: 0 },
  ],
};

randomSeed(__VU);
let keycloak = new Keycloak(config.keycloakURL, { offlineTokens: config.offlineTokens });

export const setup = setupOpenSessions(keycloak, config.realmCount, config.sessionCount);

let mySessions;

function testKCRefreshToken(setupData) {
  if (mySessions == null) {
    mySessions = [... setupData];
    shuffleArray(mySessions);
  }

  let session = mySessions.shift();
  let tokens = keycloak.refreshTokens(session.realm.id, session.tokens, session.client, check);
  session.tokens = tokens;
  mySessions.push(session);
}

export default wrapWithErrorCounting(testKCRefreshToken);
