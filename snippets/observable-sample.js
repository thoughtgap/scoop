// Benötigt dependency 'rxjs'

const { Subject, timer, merge } = require('rxjs');
const { take, map } = require('rxjs/operators');

// Stop button clicked
const stopButton$ = new Subject();

// Start triggered
const start$ = new Subject();

// Should really stop
const stop$ = new Subject();

stop$.subscribe((x) => {
    console.log('----- STOP - ' + x);
})

start$.subscribe(() => {
    const timer$ = timer(4000).pipe(map(() => 'timer'));
    const firstStop$ = merge(timer$, stopButton$)
        .pipe(take(1))
        .subscribe((x) => stop$.next(x));

    // Start gedrückt
    console.log('----- START');
})

// start ------------------|
//   |--------------------stop
//                         |-done

// start ---------|
//               stop
//                |-done





const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


rl.prompt();

rl.on('line', function(line) {
  switch(line.trim()) {
    case 'start':
      start$.next();
      break;
    case 'stop':
      stopButton$.next();
      break;
    default:
      console.log('Say what? I might have heard `' + line.trim() + '`');
      break;
  }
  rl.prompt();
}).on('close', function() {
  console.log('Have a great day!');
  process.exit(0);
});
