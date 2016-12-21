'use strict';
const fetchWagersFromCache = require('../history/fetchWagersFromCache'); 
const fetchWagersFromESI = require('../history/fetchWagersFromESI'); 
const fetchSystemData = require('../system/fetchSystemData'); 
const fetchWagerDetailsFromCache = require('../details/fetchWagerDetailsFromCache'); 
const fetchWagerDetailsFromESI = require('../details/fetchWagerDetailsFromESI'); 

exports.register = (server, options, next) => {
	fetchSystemData.init([ server, options.redis ]);
	fetchWagersFromCache.init([ server, options.redis ]);
	fetchWagersFromESI.init([ server, options.esi ]);
  fetchWagerDetailsFromCache.init([ server, options.redis ]);
  fetchWagerDetailsFromESI.init([ server, options.esi ]);
  next();
};

exports.register.attributes = {
    name: 'wagers',
    version: '1.0.0'
};