#!/usr/bin/env node

const currentNodeVersion = process.versions.node;
if (currentNodeVersion.split('.')[0] < 6) {
  console.error(
    'You are running Node ' + currentNodeVersion + '.\n' +
    'dht-infohash-pub requires Node 6 or higher. \n' +
    'Please update your version of Node.'
  );
  process.exit(1);
}

const program = require('commander');
const zmq = require('zmq');
const createCrawler = require('dht-infohash-crawler');
const DEFAULT_QUEUE_SIZE = 1024;

parseCmdLineOpts(program);
const publisher = zmq.socket('pub');
publisher.bindSync(`tcp://${program.zmqaddr}:${program.zmqport}`);
startCrawl(program.number);

function startCrawl(numOfCrawlers) {
  const recentInfohashes = createInfohashQueue();
  const noc = numOfCrawlers >= 5 ? 5 : numOfCrawlers;
  const crawlers = [];
  for (let index = 0; index < noc; ++index) {
    let crawler = createCrawler({
      address: program.dhtaddr,
      port: program.dhtport + index,
      kbucketSize: program.kbucket,
      name: `crawler-${index+1}`});

    crawler.on('infohash', (infohash, peerId, peerAddress) => {
      if (!recentInfohashes.enqueue(infohash)) return;
      if (!program.quiet) console.log(infohash);
      publisher.send([infohash, ' ', addressObjToString(peerAddress)]);
    });

    crawlers.push(crawler);
  }
}

const addressObjToString = address => `${address.address}:${address.port+''}`;

function createInfohashQueue(capacity) {
  class InfohashQueue {
    constructor(capacity = DEFAULT_QUEUE_SIZE) {
      this._infohashes = {};
      // Create 16 arrays corresponding to the first character of the infohash string.
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
        .map(hexDigit => this._infohashes[hexDigit] = []);
      this._capacity = capacity;
    }

    enqueue (infohashString) {
      const queue = this._infohashes[infohashString[0]];
      if (queue.includes(infohashString)) return false;
      if (queue.length >= this._capacity) queue.shift();
      queue.push(infohashString);
      return true;
    }
  }

  return new InfohashQueue(capacity);
}

function parseCmdLineOpts(program) {
  const VERSION = '0.2.0';
  const NUM_CRAWLER = 2;
  const DHT_ADDR = '0.0.0.0';
  const BASE_PORT = 6881;
  const KBUCKET_SIZE = 128;
  const ZMQ_ADDR = '0.0.0.0';
  const ZMQ_PORT = '65534';

  program
    .version(VERSION)
    .option('-q, --quiet', 'Do not log infohashes to the console')
    .option('-n, --number <n>', 'Number of crawler instance, default = 2', parseInt)
    .option('-a, --dhtaddr <da>', 'DHT network listening address, default = 0.0.0.0')
    .option('-p, --dhtport <dp>', 'DHT network listening port, default = 6881', parseInt)
    .option('-k, --kbucket <k>', 'DHT k-bucket size, default = 128', parseInt)
    .option('--zmqaddr <za>', 'ØMQ publishing address, default = 0.0.0.0')
    .option('--zmqport <zp>', 'ØMQ publishing port, default = 65534', parseInt)
    .parse(process.argv);

  program.number = program.number || NUM_CRAWLER;
  program.dhtaddr = program.dhtaddr || DHT_ADDR;
  program.dhtport = program.dhtport || BASE_PORT;
  program.kbucket = program.kbucket || KBUCKET_SIZE;
  program.zmqaddr = program.zmqaddr || ZMQ_ADDR;
  program.zmqport = program.zmqport || ZMQ_PORT;
}