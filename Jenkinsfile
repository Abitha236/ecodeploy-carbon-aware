pipeline {
  agent any
  triggers { githubPush() }
  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }
  environment { CI = 'true' }
  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          if (isUnix()) sh 'git log -1 --oneline'
          else bat 'git log -1 --oneline'
        }
      }
    }
    stage('Build') {
      steps {
        script {
          if (isUnix()) sh 'node --version && node --check app/server.js && node --check app/public/app.js'
          else bat 'node --version && node --check app/server.js && node --check app/public/app.js'
        }
      }
    }
    stage('Continuous tests') {
      steps {
        script {
          if (isUnix()) {
            sh '''mkdir -p test-results
              node --test --test-reporter=junit tests/*.test.js > test-results/junit.xml
              node --test --test-reporter=tap tests/*.test.js > test-results/test-output.tap'''
          } else {
            bat '''if not exist test-results mkdir test-results
              node --test --test-reporter=junit tests/*.test.js > test-results\\junit.xml
              if errorlevel 1 exit /b %ERRORLEVEL%
              node --test --test-reporter=tap tests/*.test.js > test-results\\test-output.tap'''
          }
        }
      }
      post {
        always {
          junit testResults: 'test-results/junit.xml', allowEmptyResults: false
          archiveArtifacts artifacts: 'test-results/**', allowEmptyArchive: false
        }
      }
    }
    stage('Build container') {
      steps {
        script {
          if (isUnix()) sh 'docker build -t ecodeploy:${BUILD_NUMBER} .'
          else bat 'docker build -t ecodeploy:%BUILD_NUMBER% .'
        }
      }
    }
    stage('Publish status') {
      steps { echo "EcoDeploy build ${BUILD_NUMBER}: checkout, build, tests, and image build completed." }
    }
  }
  post {
    success { echo 'EcoDeploy pipeline passed. Review the archived JUnit and TAP results.' }
    failure { echo 'Pipeline failed. Open the failed stage and inspect its console output.' }
    always { echo "Build result: ${currentBuild.currentResult}" }
  }
}
