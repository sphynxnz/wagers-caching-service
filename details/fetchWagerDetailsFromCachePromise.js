const fetchWagerDetailsFromCachePromise = (pObj) => {
	return new Promise ((resolve, reject) => {
		try {
			pObj.server.methods.fetchWagerDetailsFromCache(pObj.ticketKey, (err, cachedWagerDetails) => {
				if (err) {
					return reject(new Error(err));
				}

				Object.assign(pObj, { cachedWagerDetails: cachedWagerDetails });
        // pObj.server.log('debug', 'fetchWagerDetailsFromCachePromise: cachedWagerDetails: ' + 
        //  (cachedWagerDetails == undefined ? " undefined" : JSON.stringify(cachedWagerDetails)));
				return resolve(pObj);
			});
		} catch(error) {
			return reject (new Error (error))
		}
	});
}

module.exports = fetchWagerDetailsFromCachePromise;