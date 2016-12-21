const util = require('../util/cache-utils');
const _ = require('lodash');

const  fetchWagerDetailsFromESIPromise = (pObj) => {
	return new Promise ((resolve, reject) => {
		try {
			let server = pObj.server;
			let request = pObj.request;
			let systemData = pObj.systemData;
			let cacheData = pObj.cachedWagerDetails;
			let userId = request.params.userid;
			let today = pObj.today;
			let gameHistory = {};
      let ticketNumber = request.params.ticketnumber;
			let reloadStat = { reload: false };
      let args = {
        path: {
          userid: userId,
          ticketnumber: ticketNumber
        },
        headers: {
          user_id: request.raw.req.headers.user_id,
          esi_sid: request.raw.req.headers.esi_sid
        }
      };

			if (pObj.cachedWagerDetails != undefined) {
        cacheData = pObj.cachedWagerDetails;
				// Data in cache for user found.
        server.log('info', 'User ' + userId + ' has ticket data in cache');

        // Fetch data from ESi if these conditions are met:
        // (1) ticket data in cache is outdated OR
        // (2) request is to bypass cache OR
        // (3) request is to refresh cache only

        let ticket = util.cacheTicketReloadRequired(cacheData, today, systemData);
        if (ticket.reload || request.query.cache == 'false' || request.query.refreshonly == 'true') {
          if (request.query.refreshonly == 'true') {
            server.log('info', 'Cache refresh requested. Fetching ticket details for ticket ' + ticketNumber + ' from ESi...');            
          } else if (request.query.cache == 'false') {
            server.log('info', 'Bypassing cache. Fetching ticket details for ticket ' + ticketNumber + ' from ESi...');            
          } else {
            server.log('info', 'Ticket details not in cache. Fetching ticket details for ticket ' + ticketNumber + ' from ESi...');            
          }
        } else {
          server.log('info', 'Ticket details in cache is up to date');
          return resolve (pObj);
        }
			}

      // If we get to this point, ticket details must be fetched from ESi
			server.methods.fetchWagerDetailsFromESI(pObj.detailsUrl, args, (err, data) => {
				if (err != null) {
					return reject(new Error(JSON.stringify(err)));
				}

        server.log('info', 'Ticket details fetched from ESi...');
        cacheData = data;
        Object.assign(pObj, { cachedWagerDetails: cacheData });

        // Update cache data
        let ttl = util.calcTicketTTL(cacheData, today);
        pObj.redis.setex(pObj.ticketKey, ttl, JSON.stringify(cacheData));
        server.log('info', 'Ticket details for ticket ' + ticketNumber + ' updated in cache for user ' + userId +
          ' with TTL=' + ttl + ' seconds');

        // Return the ticket details fetched from ESi - already in pObj.cachedWagerDetails
        // server.log('debug', ' fetchWagerDetailsFromESIPromise: pObj.cachedWagerDetails: ' + JSON.stringify(pObj.cachedWagerDetails));
				return resolve(pObj);
			});
		} catch(error) {
			return reject (new Error(error));
		}
	});
}

module.exports =  fetchWagerDetailsFromESIPromise;