const init = (params) => {
	const [ server, esi ] = params;
	const fetchWagersFromESI = (url, args, callback) => {

    server.log('info', args);

    esi.get(
      url,
      args,
      function(data, resp) {
        if (resp.statusCode != 200) {
          if (data instanceof Buffer) {
            data = data.toString('utf-8');
          }
          server.log('error', 'fetchWagersFromESI: Error in ESi API call: ' + JSON.stringify(data));
          let err = { message: data, code: resp.statusCode};
          return (callback(err, null));
        }
        server.log('info', 'fetchWagersFromESI: Ticket history data for userid ' + args.path.userid + ' fetched from ESi..');
        return (callback(null, data));
      }
    );
	}

	server.method('fetchWagersFromESI', fetchWagersFromESI);
  server.log('info', 'fetchWagersFromESI loaded');
}

module.exports = {
	'init': init
}