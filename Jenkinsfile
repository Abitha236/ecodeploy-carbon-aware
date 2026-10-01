pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds(); buildDiscarder(logRotator(numToKeepStr: '20')) }
  environment { CI = 'true' }
  stages {
    stage('Checkout') { steps { checkout scm; sh 'git log -1 --oneline' } }
    stage('Build') { steps { sh 'node --version && npm --version && npm install --package-lock-only --ignore-scripts --no-audit --no-fund && npm ci --ignore-scripts --no-audit --no-fund' } }
    stage('Continuous tests') {
      steps {
        sh '''mkdir -p test-results
          node --test --test-reporter=junit tests/*.test.js > test-results/junit.xml
          node --test --test-reporter=tap tests/*.test.js | tee test-results/test-output.tap'''
      }
      post { always { junit testResults: 'test-results/junit.xml', allowEmptyResults: true; archiveArtifacts artifacts: 'test-results/**', allowEmptyArchive: true } }
    }
    stage('Build container') { steps { sh 'docker build -t ecodeploy:${BUILD_NUMBER} .' } }
    stage('Publish status') { steps { echo "EcoDeploy build ${BUILD_NUMBER}: checkout, build, tests, and image build completed." } }
  }
  post {
    success { echo '✅ EcoDeploy pipeline passed. Review archived TAP test results.' }
    failure { echo '❌ Pipeline failed. Open the failed stage and inspect its console output.' }
    always { echo "Build result: ${currentBuild.currentResult}" }
  }
}
