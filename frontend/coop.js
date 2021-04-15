angular.module('todoApp', ['angularMoment'])
  .run(function(amMoment) {
    amMoment.changeLocale('de');
});

angular.module('todoApp', ['angularMoment'])
  .controller('coopCtrl', ['$scope', '$http', 'moment', function($scope, $http, moment) {

    
    $scope.coopStatus = {};
    $scope.coopStatusLaedt = false;
    $scope.coopStatusVonWann = null;

    const coopUrl = 'http://192.168.31.21:3000/';

    $scope.camera = {
      url: null,
      time: null,
      urlNightVision: null,
      timeNightVision: null,
    }

    $scope.updateCameraTime = (newTime,isNightVision=false) => {
      if(isNightVision) {
        $scope.camera.timeNightVision = newTime;
      }
      else {
        $scope.camera.time = newTime;
      }

      $scope.camera.url = coopUrl + 'cam/' + moment($scope.camera.time).unix();
      $scope.camera.urlNightVision = coopUrl + 'nightvision/' + moment($scope.camera.timeNightVision).unix();
    };

    $scope.getStatus = () => {
        $scope.coopStatusLaedt = true;

        $http({
          method: 'GET',
          url: coopUrl + 'status'
        }).then(function successCallback(response) {
            $scope.coopStatus = response.data;
            $scope.coopStatusLaedt = false;
            $scope.coopStatusVonWann = new Date();

            $scope.updateCameraTime($scope.coopStatus.camera.time, false);
            $scope.updateCameraTime($scope.coopStatus.camera.ir.time, true);
          }, function errorCallback(response) {
            $scope.coopStatusLaedt = false;
            $scope.coopStatusVonWann = new Date();
          });
    }
    $scope.getStatus();

    
    

    $scope.klappeIst = (obenUnten) => {
      if(obenUnten=="oben") {
        reqUrl = coopUrl + 'kalibriere/oben';
      }
      else if (obenUnten=="unten") {
        reqUrl = coopUrl + 'kalibriere/unten';
      }
      else {
        alert("Fehler");
      }

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
          $scope.kalibriereStatus = response.data;
          $scope.kalibriereStatusVonWann = new Date();
          $scope.getStatus();
        }, function errorCallback(response) {
          alert("Fehler beim Kalibrieren: "+ response);
          $scope.kalibriereStatus = response.data;
          $scope.kalibriereStatusVonWann = new Date();
          $scope.getStatus();
        });
    }

    $scope.klappeKorrigieren = (hochRunter) => {
      if(hochRunter=="hoch") {
        reqUrl = coopUrl + 'korrigiere/hoch';
      }
      else if (hochRunter=="runter") {
        reqUrl = coopUrl + 'korrigiere/runter';
      }
      else {
        alert("Fehler");
      }

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
          $scope.korrigierStatus = response.data;
          $scope.korrigierStatusVonWann = new Date();
        }, function errorCallback(response) {
          alert("Fehler beim Korrigieren: "+ response);
          $scope.korrigierStatus = response.data;
          $scope.korrigierStatusVonWann = new Date();
        });
    }

    $scope.fahreKlappe = (hochRunter) => {
      if(hochRunter=="hoch") {
        reqUrl = coopUrl + 'hoch';
      }
      else if (hochRunter=="runter") {
        reqUrl = coopUrl + 'runter';
      }
      else {
        alert("Fehler");
      }

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
          $scope.fahreStatus = response.data;
          $scope.fahreStatusVonWann = new Date();

          // Lade in 10s erneut
          setTimeout(function erneutLesen() {
            $scope.getStatus();
          }, 10 * 1000);
        }, function errorCallback(response) {
          $scope.fahreStatus = response.data;
          $scope.fahreStatusVonWann = new Date();
        });
    }

    $scope.nachtsichten = () => {
      let reqUrl = coopUrl + 'nightvision/new/';

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
        $scope.nachtsichtStatus = response.data;
        $scope.nachtsichtStatusVonWann = new Date();
      }, function errorCallback(response) {
        $scope.nachtsichtStatus = response.data;
        $scope.nachtsichtStatusVonWann = new Date();
      });
    }

    $scope.schalteLicht = (anAus) => {
      if(anAus) {
        reqUrl = coopUrl + 'shelly/turn/on';
      }
      else {
        reqUrl = coopUrl + 'shelly/turn/off';
      }

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
        $scope.getStatus();
      }, function errorCallback(response) {
        $scope.getStatus();
        alert("Fehler beim Licht schalten: "+ response);
      });
    }

    $scope.schalteHeizung = (anAus) => {
      if(anAus) {
        reqUrl = coopUrl + 'heating/enable';
      }
      else {
        reqUrl = coopUrl + 'heating/disable';
      }

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
        $scope.getStatus();
      }, function errorCallback(response) {
        $scope.getStatus();
        alert("Fehler beim Heizung schalten: "+ response);
      });
    }

    $scope.getLichtStatus = (anAus) => {
      reqUrl = coopUrl + 'shelly/update';

      $http({
        method: 'GET',
        url: reqUrl
      }).then(function successCallback(response) {
        $scope.getStatus();
      }, function errorCallback(response) {
        $scope.getStatus();
        alert("Fehler beim Licht updaten: "+ response);
      });
    }

    // Subscribe to coop events
    var es = new EventSource('/events');
    es.addEventListener('newWebcamPic', function (event) {
      // Pass the new timestamp to determine the new pic's url
      $scope.updateCameraTime(JSON.parse(event.data), false);
      $scope.$apply();
    });
    es.addEventListener('newWebcamPicIR', function (event) {
      // Pass the new timestamp to determine the new pic's url
      $scope.updateCameraTime(JSON.parse(event.data),true); //.replaceAll('"',''), true);
      $scope.$apply();
    });
    es.addEventListener('klappenPosition', function (event) {
      $scope.coopStatus.klappe.position = JSON.parse(event.data); //.replaceAll('"','');
      $scope.$apply();
    });
    es.addEventListener('klappenStatus', function (event) {
      $scope.coopStatus.klappe.status = JSON.parse(event.data); //.replaceAll('"','');
      $scope.$apply();
    });
    es.addEventListener('shellyRelayIsOn', function (event) {
      $scope.coopStatus.shelly.relay.ison = JSON.parse(event.data);
      $scope.$apply();
    });
    es.addEventListener('heating', function (event) {
      $scope.coopStatus.heating.status = JSON.parse(event.data);
      $scope.$apply();
    });
  }]);