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

    $scope.cameraUrl = '';
    $scope.cameraTime = '';

    $scope.setCameraUrl = () => {
      $scope.cameraUrl = coopUrl + 'cam/' + moment($scope.cameraTime).unix();
      $scope.cameraUrlNightVision = coopUrl + 'nightvision/' + moment($scope.cameraTimeNightVision).unix();
    }

    $scope.getStatus = () => {
        $scope.coopStatusLaedt = true;
        // Simple GET request example:
        $http({
          method: 'GET',
          url: coopUrl + 'status'
        }).then(function successCallback(response) {
            // this callback will be called asynchronously
            // when the response is available
            //todoList.coop.status = response;
            $scope.coopStatus = response.data;
            $scope.coopStatusLaedt = false;
            $scope.coopStatusVonWann = new Date();
            
            $scope.cameraTime = $scope.coopStatus.camera.time;
            $scope.cameraTimeNightVision = $scope.coopStatus.camera.ir.time;
            $scope.setCameraUrl();

          }, function errorCallback(response) {
            $scope.coopStatusLaedt = false;
            $scope.coopStatusVonWann = new Date();
            // called asynchronously if an error occurs
            // or server returns response with an error status.
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





    var todoList = this;
    todoList.todos = [
      {text:'learn AngularJS', done:true},
      {text:'build an AngularJS app', done:false}];
 
    todoList.addTodo = function() {
      todoList.todos.push({text:todoList.todoText, done:false});
      todoList.todoText = '';
    };
 
    todoList.remaining = function() {
      var count = 0;
      angular.forEach(todoList.todos, function(todo) {
        count += todo.done ? 0 : 1;
      });
      return count;
    };
 
    todoList.archive = function() {
      var oldTodos = todoList.todos;
      todoList.todos = [];
      angular.forEach(oldTodos, function(todo) {
        if (!todo.done) todoList.todos.push(todo);
      });
    };
  }]);