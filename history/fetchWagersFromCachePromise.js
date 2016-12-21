const fetchWagersFromCachePromise = (pObj) => {
	return new Promise ((resolve, reject) => {
		try {
			pObj.server.methods.fetchWagersFromCache(pObj.historyKey, (err, cachedWagers) => {
				if (err) {
					return reject(new Error(err));
				}

				Object.assign(pObj, { cachedWagers: cachedWagers });
        //pObj.server.log('debug', 'fetchWagersFromCachePromise: cachedWagers.dateSegments: ' + 
        //  (cachedWagers == undefined ? " undefined" : JSON.stringify(cachedWagers.dateSegments)));
				return resolve(pObj);
			});
		} catch(error) {
			return reject (new Error (error))
		}
	});
}

module.exports = fetchWagersFromCachePromise;