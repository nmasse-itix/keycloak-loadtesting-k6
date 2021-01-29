import { check, sleep } from 'k6';
import { wrapWithErrorCounting, shuffleArray, getTestConfig, setupOpenSessions, Keycloak } from "./lib/keycloak.js";
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
