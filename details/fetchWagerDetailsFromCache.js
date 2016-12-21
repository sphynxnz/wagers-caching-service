const init = (params) => {
	const [ server, redis ] = params;
	const fetchWagerDetailsFromCache = (ticketKey, callback) => {
		let cachedWagerDetails = {};
	  redis.get(ticketKey, (err, response) => {
	    if (err || response == null) {
	      server.log('warning', 'fetchWagerDetailsFromCache: Cannot fetch ' + ticketKey + ' from cache');
	      cachedWagerDetails = undefined;
	    } else {
	      // Parse fetched data
	      server.log('info', 'fetchWagerDetailsFromCache: Fetch successful for key ' + ticketKey);        
	      cachedWagerDetails = JSON.parse(response);
	    }
	    return (callback(null, cachedWagerDetails));	
		});
		redis.on('error', (error) => {
			return(callback(error, null));
		});
	}

	server.method('fetchWagerDetailsFromCache', fetchWagerDetailsFromCache);
  server.log('info', 'fetchWagerDetailsFromCache loaded');
}

module.exports = {
	'init': init
}