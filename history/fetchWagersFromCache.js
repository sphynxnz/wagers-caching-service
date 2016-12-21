const init = (params) => {
	const [ server, redis ] = params;
	const fetchWagersFromCache = (historyKey, callback) => {
		let cachedWagers = {};
	  redis.get(historyKey, (err, response) => {
	    if (err || response == null) {
	      server.log('warning', 'fetchWagersFromCache: Cannot fetch ' + historyKey + ' from cache');
	      cachedWagers = undefined;
	    } else {
	      // Parse fetched data
	      server.log('info', 'fetchWagersFromCache: Fetch successful for key ' + historyKey);        
	      cachedWagers = JSON.parse(response);
	    }
	    return (callback(null, cachedWagers));	
		});
		redis.on('error', (error) => {
			return(callback(error, null));
		});
	}

	server.method('fetchWagersFromCache', fetchWagersFromCache);
  server.log('info', 'fetchWagersFromCache loaded');
}

module.exports = {
	'init': init
}