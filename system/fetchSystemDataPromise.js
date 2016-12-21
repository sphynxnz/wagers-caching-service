const fetchSystemDataPromise = (pObj) => {
	return new Promise ((resolve, reject) => {
		try {
			pObj.server.methods.fetchSystemData(pObj.systemKey, (err, systemData) => {
				if (err) {
					return reject(new Error(err));
				}
				Object.assign(pObj, { systemData: systemData });
        //pObj.server.log('debug', 'fetchSystemDataPromise: pObj.systemData: ' + JSON.stringify(pObj.systemData))
				return resolve(pObj);
			});
		} catch(error) {
			return reject (new Error (error))
		}
	});
}

module.exports = fetchSystemDataPromise;