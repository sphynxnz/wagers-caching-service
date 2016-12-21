const init = (params) => {
	const [ server, esi ] = params;
	const fetchWagerDetailsFromESI = (url, args, callback) => {

    server.log('info', args);

    esi.get(
      url,
      args,
      function(data, resp) {
        if (resp.statusCode != 200) {
          if (data instanceof Buffer) {
            data = data.toString('utf-8');
          }
          server.log('error', 'fetchWagerDetailsFromESI: Error in ESi API call: ' + JSON.stringify(data));
          let err = { message: data, code: resp.statusCode};
          return (callback(err, null));
        }
        server.log('info', 'fetchWagerDetailsFromESI: Ticket details for ticket ' + args.path.ticketnumber + 
          ' for userid ' + args.path.userid + ' fetched from ESi..');
        return (callback(null, data));
      }
    );
	}

	server.method('fetchWagerDetailsFromESI', fetchWagerDetailsFromESI);
  server.log('info', 'fetchWagerDetailsFromESI loaded');
}

module.exports = {
	'init': init
}