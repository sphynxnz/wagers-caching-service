const moment = require('moment');
const hoek = require('hoek');
const _ = require('lodash');

// Get open tickets from history
const getOpenTickets = (gameHistory, cutoff) => {
  // Set cutoff to the parameter provided, if none, then use current date
  let today = (cutoff ? cutoff : moment().format('YYYY-MM-DD'));

  // Extract all OPEN tickets from the game history segment 
  return gameHistory.filter(
    (e) => {
      // Return tickets that are OPEN and
      // with draw history info entries that is Active and associated draw date later than the current date
      return (e.ticketStatus == 'OPEN' &&
        e.drawHistoryInfo.filter(
          (d) => {
            let drawDate = d.drawDate.substr(0, 10);
            return (d.drawStatus == 'Active' && drawDate(0, 10) > today);
          }
        ).length > 0
      )
    }
  )
}

// Get open tickets from history
const hasOpenInOverlap = (gameHistory, startDate, endDate) => {
  // Truncate start and end dates - grab the YYYY-MM-DD part only
  let startdate = startDate.substr(0,10);
  let enddate = endDate.substr(0,10);

  // Find first instance of ticket history entry matching end date (search starting from top)
  let i = _.findIndex(gameHistory, (t) => { return (t.purchaseDate.substr(0, 10) <= enddate) });

  // Find first instance of ticket history entry matching start date (search starting from bottom)
  let j = _.findLastIndex(gameHistory, (t) => { return (t.purchaseDate.substr(0, 10) >= startdate) });

  // Search for the first OPEN ticket starting from start date moving to end date
  while (j >= i && gameHistory[j].ticketStatus != 'OPEN') {
  	j--;
  }

  // If OPEN ticket is found, return status and the index of the entry in the game history array
  if (j >= i) {
  	return({ hasOpen: true, index: j});
  }

  // No open ticket found
  return ({ hasOpen: false });
}

// Get earliest next draw date for OPEN tickets
const getNextDrawDates = (gameHistory) => {
  return gameHistory.filter((t) => { return (t.ticketStatus == 'OPEN') }).map(
    (t) => {
      let i = _.findIndex(t.drawHistoryInfo, (d) => { return (d.drawStatus == 'Active') });
      if (i >= 0) {
        return ({ 
          gameName: t.gameName,
          ticketNumber: t.ticketNumber, 
          purchaseDate: t.purchaseDate.substr(0,10), 
          nextDrawDate: t.drawHistoryInfo[i].drawDate.substr(0,10),
          nextDrawNumber: t.drawHistoryInfo[i].drawId
        });
      }
    }
  );
}

// Check if cache needs to be reloaded
const cacheReloadRequired = (gameHistory, cutoffDate, latestDrawNumbers) => {
  // Check if there is an open ticket in this game history segment, searching from oldest (start date) to newest (end date)
  let idx = _.findLastIndex(gameHistory, (e) => { return (e.ticketStatus == 'OPEN') });
  if (idx < 0) {
    // if no Open ticket found, then there is no need to reload
    return ({reload: false });
  }
  // An open ticket is found. Do the following:
  // (1) Get the segment of the game history from the start (latest date) up to where the OPEN ticket was found:
  //     _.slice(gameHistory, 0, idx + 1)
  // (2) Get a list of the earliest next draw date for all OPEN tickets in the segment from #1 above:
  //     getNextDrawDates()
  // (3) Sort the resulting list in ascending order by next draw date
  let nextDrawDates = getNextDrawDates(_.slice(gameHistory, 0, idx + 1)).sort((a, b) => {
    if (a.nextDrawDate < b.nextDrawDate) {
      return (-1);
    }
    if (a.nextDrawDate > b.nextDrawDate) {
      return (1);
    }
    return (0);
  });

  if (nextDrawDates[0] == undefined) {
    return({reload:false});
  }

  // If the earliest next draw date is later than the cutoffDate (e.g. current date), then no need to reload
  // because the draw has not happened yet.
  if (nextDrawDates[0].nextDrawDate > cutoffDate) {
    return ({reload: false});
  }

  // If the earliest next draw date is earlier than the cutoffDate (e.g. current date), then there is a need to reload
  // because the draw has already happened. 
  if (nextDrawDates[0].nextDrawDate < cutoffDate) {
    return ({reload: true, ticket: nextDrawDates[0]});
  }

  // Need to know if previous fetch of latestDrawNumbers was succesful, otherwise, forced reload
  if (latestDrawNumbers == undefined) {
    return ({reload: true, ticket: nextDrawDates[0]});
  }

  // If we get to this point, the earliest next draw date is equal to the cutoffDate (e.g. current date), 
  // then check if the draw has been published already for all entries in the array where the next draw date
  // is equal to the cutoffDate. If all draw numbers have not been published yet then there is no need to
  // reload because the draw(s) has/have not happened yet. 
  let i = 0;
  let n = nextDrawDates.length;
  while (i < n) {
    if (nextDrawDates[i].nextDrawDate == cutoffDate) {
      if (latestDrawNumbers[nextDrawDates[i].gameName] >= nextDrawDates[0].nextDrawNumber) {
        // We found one with draw already published, need to reload cache
        return ({reload: true, ticket: nextDrawDates[0]});
      }
    } else {
      // We've exhausted all entries with next draw date equal to cutoffDate and not
      // found any reason to reload, force exit of while loop
      i = n;
    }
    i++;
  }

  // Reload not required
  return ({reload: false});
}

// Get earliest next draw date for one OPEN ticket
const getTicketNextDrawDate = (t) => {
  // Make sure ticket is OPEN, else return undefined
  if (t.ticketStatus == 'CLOSE') {
    return (undefined);
  }

  // Look for earliest Active entry in drawWinDetails
  let i = _.findIndex(t.drawWinDetails, (d) => { return (d.drawStatus == 'Active') });

  // If no Active entry found return undefined
  if (i < 0) {
    return (undefined);
  }

  // Active entry found, extract draw details
  return ({ 
    gameName: t.gameName,
    ticketNumber: t.ticketNumber, 
    purchaseDate: t.purchaseDate.substr(0,10), 
    nextDrawDate: t.drawWinDetails[i].drawDate.substr(0,10),
    nextDrawNumber: t.drawWinDetails[i].drawNumber
  });
}

// Check if reload of ticket is required
const cacheTicketReloadRequired = (ticketDetails, cutoffDate, latestDrawNumbers) => {
  // Search for earliest active entry in drawWinDetails of the ticket
  let nextDrawDate = getTicketNextDrawDate(ticketDetails);
  // If ticket is CLOSEd or no Active entry found in drawWinDetails, no reload
  if (nextDrawDate == undefined) {
    return({ reload: false});
  }

  // If earliest next draw date is later than cutoff date, no reload
  if (nextDrawDate.nextDrawDate > cutoffDate) {
    return({ reload: false});
  }

  // If earliest next draw date is earlier than cutoff date, then reload required
  if (nextDrawDate.nextDrawDate < cutoffDate) {
    return({ reload: true, ticket: nextDrawDate});
  }

  // Need to know if previous fetch of latestDrawNumbers was succesful, otherwise, forced reload
  if (latestDrawNumbers == undefined) {
    return ({reload: true, ticket: nextDrawDate});
  }

  // Draw numbers known. Check if latest draw number published for the game is greater than 
  // or equal than the earliest next draw number for the ticket for this game
  if (latestDrawNumbers[nextDrawDate.gameName] >= nextDrawDate.nextDrawNumber) {
    // If so, need to reload ticket
    return ({reload: true, ticket: nextDrawDate});
  }

  // No need to reload ticket. Game draw number for this ticket has not been published yet
  return ({reload: false});
}

// Sort ticket history by ticketNumber in descending order
const sortTicketHistory = (gameHistory) => {
  return gameHistory.sort((a, b) => {
    return (b.ticketNumber - a.ticketNumber)
  })
}

// Sort ticket history by purchase date in descending order
const sortByPurchaseDate = (gameHistory) => {
  return gameHistory.sort((a, b) => {
    let ad = a.purchaseDate.substr(0, 10);
    let bd = b.purchaseDate.substr(0, 10);
    if (bd > ad) {
      return (-1);
    }
    if (ad > bd) {
      return (1);
    }
    return (0);
  })
}

// Remove duplicates from ticket history
const uniqueTicketHistory = (gameHistory) => {
  return hoek.unique(gameHistory, 'ticketNumber')
}

// Find index of ticket number from ticket history
const findTicketIndex = (gameHistory, ticketNumber) => {
  return _.findIndex(gameHistory, (e) => {
    return e.ticketNumber == ticketNumber
  })
}

// Fetch game history for specific games
const findGames = (gameHistory, games) => {
  return gameHistory.filter((e) => {
    return (hoek.contain(games, e.gameName))
  })
}

// Fetch game history bounded by start and end dates
const fetchGameHistory = (gameHistory, startDate, endDate) => {
  let startdate = startDate.substr(0, 10);
  let enddate = endDate.substr(0, 10);

  return gameHistory.filter(
    (e) => {
      let pd = e.purchaseDate.substr(0, 10);
      return (startdate <= pd && pd <= enddate)
    }
  )
}

// Checks if game history is in cache
const ticketsInCache = (dateSegments, startDate, endDate) => {
  let startdate = startDate.substr(0, 10);
  let enddate = endDate.substr(0, 10);
  return (_.findIndex(
    dateSegments,
    (e) => {
      return (startdate >= e.startDate.substr(0, 10) && enddate <= e.endDate.substr(0, 10))
    }
  ) >= 0)
}

// Checks if new segment overlaps with cached data
const findOverlap = (dateSegments, startDate, endDate) => {
  let startdate = startDate.substr(0, 10);
  let enddate = endDate.substr(0, 10);
  let idx = _.findIndex(
    dateSegments,
    (e) => {
      return (startdate <= e.endDate.substr(0, 10) && e.startDate.substr(0, 10) <= enddate)
    }
  )
  if (idx >= 0) {
  	return dateSegments[idx];
  }
  return (undefined);
}

// Add new date segment in sorted (descending by date) array
const addDateSegment = (dateSegments, startDate, endDate) => {
  // Extract YYYY-MM-DD portion of start and end dates
  let startdate = startDate.substr(0, 10);
  let enddate = endDate.substr(0, 10);

  // Create object for new date segment to be added
  let date_segment = {
    endDate: enddate,
    startDate: startdate
  };

  // Add new date segment and sort all entries by end date in descending order
  dateSegments.push(date_segment);
  dateSegments = dateSegments.sort((a, b) => {
    if (a.endDate > b.endDate) {
      return (-1)
    }
    if (a.endDate < b.endDate) {
      return (1);
    }
    return (0);
  });

  //Build new date segments
  let newDS = [];

  // Move first entry from current date segments (dateSegments) to new date segments (newDS)
  // The first entry in the new date segments has an end date that is guaranteed to be greater than or equal to
  // the head entry in the current date segments
  newDS.push(dateSegments.shift());

  // Iterate until current date segments is empty
  let idx = 0;
  while (dateSegments.length > 0) {
    // Grab head entry from the current data segments and remove it from the current date segments array
    let ds = dateSegments.shift();

    // Test if there is an overlap with the latest (tail) entry in the new date segments and the one
    // just extracted from the head of the current date segments
    if (newDS[idx].startDate <= ds.endDate && newDS[idx].endDate >= ds.startDate) {
      // If there is an overlap, check if tail entry in the new date segments has a start date greater
      // than the head entry from the current date segment 
      if (newDS[idx].startDate > ds.startDate) {
        // If so, then use the head entry start date from the current date segment as the new start date for
        // the tail entry in the new date segments array  
        newDS[idx].startDate = ds.startDate;
      }
    } else {
      // There is no overlap, check if the tail entry in the new date segments and the head entry in the 
      // current date segments are adjacent to each other
      let dsEndNextDay = moment(moment(ds.endDate) + moment.duration(1, 'day')).format('YYYY-MM-DD');
      if (newDS[idx].startDate == dsEndNextDay) {
        // If so, merge adjacent date segments by assigning the start date of the head entry from the current
        // date segments to the start date of the tail entry in the new date segments.
        newDS[idx].startDate = ds.startDate;
      } else {
        // The segments are not adjacent and not overlapping.
        // Just add the head entry from the current date segments to the tail of the new date segments
        newDS.push(ds);
        // Increment the index to the new date segments array, thereby making the recently added date segment
        // as the new tail entry
        idx++
      }
    }
  }

  // Return the new date segments, i.e. with the new date segment either added (no overlap) or 
  // merged (if there are overlaps)
  return newDS;
}

// calcTicketTTL - calculate ticket TTL
const calcTicketTTL = (ticketDetails, today) => {
  // Search for earliest active entry in drawWinDetails of the ticket
  let nextDrawDate = getTicketNextDrawDate(ticketDetails);
  // If ticket is CLOSEd or no Active entry found in drawWinDetails, then calculate TTL as follows
  // if (purchase date > 4 months old), TTL = 1 week
  // if (purchase date < 4 months old), TTL = (purchase date - date(4 months ago))
  if (nextDrawDate == undefined) {
    let purchaseDate = ticketDetails.purchaseDate.substr(0, 10);
    let fourMonthsAgo = moment(today).subtract(4, 'months').format('YYYY-MM-DD');
    if (purchaseDate > fourMonthsAgo) {
      return (Math.abs(moment(purchaseDate).diff(moment(fourMonthsAgo), 'seconds')));
    }
    // return 1 week in seconds
    return (604800);
  }

  // Else calculate TTL as difference between today and next draw date
  return (Math.abs(moment(nextDrawDate.nextDrawDate).diff(moment(today), 'seconds')));
}

module.exports = {
  'getOpenTickets': getOpenTickets,
  'hasOpenInOverlap': hasOpenInOverlap,
  'findOverlap': findOverlap,
  'getNextDrawDates': getNextDrawDates,
  'cacheReloadRequired': cacheReloadRequired,
  'getTicketNextDrawDate': getTicketNextDrawDate,
  'cacheTicketReloadRequired': cacheTicketReloadRequired,
  'sortTicketHistory': sortTicketHistory,
  'sortByPurchaseDate': sortByPurchaseDate,
  'uniqueTicketHistory': uniqueTicketHistory,
  'findTicketIndex': findTicketIndex,
  'findGames': findGames,
  'fetchGameHistory': fetchGameHistory,
  'ticketsInCache': ticketsInCache,
  'addDateSegment': addDateSegment,
  'calcTicketTTL': calcTicketTTL
}