import { shallowRef } from 'vue'

export const signupSurveyRequest = shallowRef(null)

export function completeSignupSurvey(result) {
  if (!result.signup_survey || !result.token) return Promise.resolve()
  if (signupSurveyRequest.value) return signupSurveyRequest.value.finished
  let resolve
  const finished = new Promise(done => { resolve = done })
  signupSurveyRequest.value = { result, finished, resolve }
  return finished
}
