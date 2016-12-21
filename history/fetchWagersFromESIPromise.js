const util = require('../util/cache-utils');
const _ = require('lodash');

const fetchWagersFromESIPromise = (pObj) => {
	return new Promise ((resolve, reject) => {
		try {
			let server = pObj.server;
			let request = pObj.request;
			let systemData = pObj.systemData;
			let cacheData = pObj.cachedWagers;
			let userId = request.params.userid;
			let startDate = request.query.startdate.substr(0, 10);
			let endDate = request.query.enddate.substr(0, 10);
			let today = pObj.today;
			let gameHistory = {};
			let reloadStat = { reload: false };
			let utcSuffix = 'T00:00:00.000Z';
		  let args = {
		    path: {
		      userid: userId
		    },
		    parameters: {
		      startdate: request.query.startdate,
		      enddate: request.query.enddate,
		      lotto: true,
		      keno: true,
		      bullseye: true,
		      play3: true,
		      strikeCategory: true
		    },
		    headers: {
		      user_id: request.raw.req.headers.user_id,
		      esi_sid: request.raw.req.headers.esi_sid
		    }
		  }

			if (pObj.cachedWagers != undefined) {
        cacheData = pObj.cachedWagers;
				// Data in cache for user found.
        server.log('info', 'User ' + userId + ' has ticket history data in cache');

        // Use the cache if these conditions are met otherwise refresh data from ESi
        // (1) startdate and enddate are in the fetched data from cache AND
        // (2) cache is not being bypassed (cache != 'false') AND !systemData.cachingEnabled
        // (3) cache is not being refreshed only (refhreshonly != 'true') 
        let inCache = util.ticketsInCache(cacheData.dateSegments, startDate, endDate);
        if (inCache && request.query.cache != 'false' && request.query.refreshonly != 'true' 
        	&& systemData.cachingEnabled) {
          server.log('info', 'Ticket history data requested found in cache for user ' + userId);
          gameHistory = util.fetchGameHistory(cacheData.gameHistory, startDate, endDate);
          server.log('info', 'Game history fetched, count='+ gameHistory.length);
          reloadState = util.cacheReloadRequired(gameHistory, today, systemData);
          server.log('info', JSON.stringify(reloadState));
          if (reloadState.reload) {
            server.log('info', 'Ticket data found in cache needs to be updated. Optimal reload starts at ' + 
              reloadState.ticket.purchaseDate);
            // Update start date for subsequent API call to ESi
            args.parameters.startdate = reloadState.ticket.purchaseDate + utcSuffix;
          } else {
          	// Data is in cache and up to date. Resolve this promise
            server.log('info', 'Ticket data found in cache is up to date');
            Object.assign(pObj, { gameHistory: gameHistory });
            return resolve (pObj);
          }
        } else {
          if (request.query.refreshonly == 'true') {
            server.log('info', 'Cache refresh requested. Fetching ticket history segment for userid ' + userId + ' from ESi...');            
          } else if (request.query.cache == 'false' || systemData.cachingEnabled == false) {
            server.log('info', 'Bypassing cache. Fetching ticket history segment for userid ' + userId + ' from ESi...');            
          } else {
            server.log('info', 'Ticket history segment not in cache. Fetching ticket history segment for userid ' + userId + ' from ESi...');            
          }
        }

        // If we get to this point, data must be fetched from ESi
        // Check for date segments overlap if cache bypass and cache refresh only are not being requested
        let overlap = undefined;
        let sdate = startDate.substr(0,10);
        let edate = endDate.substr(0,10);
        //if ((request.query.cache != 'false' || systemData.cachingEnabled) && request.query.refreshonly != true) {
        if ((request.query.cache != 'false') && request.query.refreshonly != true) {
          overlap = util.findOverlap(cacheData.dateSegments, startDate, endDate);
          server.log('info', 'overlap: ' + JSON.stringify(overlap));
          if (overlap != undefined) {
            if (sdate >= overlap.startDate && sdate <= overlap.endDate) {
              // new segment overlap on top of cached segment 
              server.log('info', 'before overlapStatus');
              let overlapStatus = util.hasOpenInOverlap(cacheData.gameHistory, startDate, overlap.endDate);
              server.log('info', 'overlapStatus: ' + JSON.stringify(overlapStatus));
              if (overlapStatus.hasOpen) {
                args.parameters.startdate = cacheData.gameHistory[overlapStatus.index].purchaseDate.substr(0,10) + utcSuffix;
              } else {
                args.parameters.startdate = overlap.endDate.substr(0,10) + utcSuffix;
              }
              server.log('info', 'Ticket history overlap on top. Optimal fetch start date changed to ' + 
                args.parameters.startdate.substr(0,10));
            } else if (overlap.startDate >= sdate && overlap.startDate <= edate) {
              // New segment overlap at bottom of cached segment
              let i = _.findIndex(cacheData.gameHistory, (t) => { return (t.purchaseDate.substr(0, 10) <= edate) });
              let j = _.findLastIndex(cacheData.gameHistory, (t) => { return (t.purchaseDate.substr(0, 10) >= overlap.startDate) });
              let ov = _.slice(cacheData.gameHistory, i, j + 1);
              let rs = util.cacheReloadRequired(ov, today, systemData);
              if (!rs.reload) {
                // If there is no need to reload the overlapping segments, then end date can be set to start date of overlap
                // otherwise just use the default provided start and end dates in the API call
                args.parameters.enddate = overlap.startDate.substr(0,10) + utcSuffix;
                server.log('info', 'Ticket history overlap at bottom does not require reload. Optimal fetch end date date changed to ' + 
                  args.parameters.enddate.substr(0,10));
              }
            }
          }
        }
			} else {
				cacheData = {
					dateSegments: [],
					gameHistory: []
				}
			}

			server.methods.fetchWagersFromESI(pObj.historyUrl, args, (err, data) => {
				if (err != null) {
					return reject(new Error(JSON.stringify(err)));
				}

        server.log('info', 'Ticket history data fetched from ESi...');
        cacheData.gameHistory = util.sortTicketHistory(util.uniqueTicketHistory(data.gameHistory.concat(cacheData.gameHistory)));
        cacheData.dateSegments = util.addDateSegment(cacheData.dateSegments, startDate, endDate);
  
        gameHistory = util.fetchGameHistory(cacheData.gameHistory, startDate, endDate);

        // Update cache data
        pObj.redis.set(pObj.historyKey, JSON.stringify(cacheData));
        server.log('info', 'Ticket history data updated in cache for user ' + userId);

        // Return the ticket history fetched from ESi
        pObj = Object.assign(pObj, { gameHistory: gameHistory });
        //server.log('debug', 'fetchWagersFromESIPromise: pObj.gameHistory[0]: ' + JSON.stringify(pObj.gameHistory[0]));
				return resolve(pObj);
			});
		} catch(error) {
			return reject (new Error(error));
		}
	});
}

module.exports = fetchWagersFromESIPromise;