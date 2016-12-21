const init = (params) => {
	const [ server, redis ] = params;
	const fetchSystemData = (systemKey, callback) => {
	  redis.get(systemKey, (err, response) => {
	  	let systemData = undefined;
	    if (err || response == null) {
	      server.log('warning', 'fetchSystemData: Cannot fetch ' + systemKey + ' from cache');
	    } else {
	      systemData = JSON.parse(response);
	      server.log('info', 'fetchSystemData: systemData: ' + JSON.stringify(systemData));        
	    }
	    return (callback(null, systemData));	
		});
		redis.on('error', (error) => {
			return(callback(error, null));
		});
	}

	server.method('fetchSystemData', fetchSystemData);
  server.log('info', 'fetchSystemData loaded')
}

module.exports = {
	'init': init
}