const fs       = require('fs')
const YAML     = require('yaml')
const pem      = require('pem')
const { exec } = require('child_process')

// GET SITES CONFIG
const config = YAML.parse( fs.readFileSync('./config.yml', 'utf8') )

// HOSTS
function buildHosts() {

	let hosts = fs.readFileSync(config.hosts.path, 'utf8')

	const lines = []
	lines.push( `# begin ${config.name}` )
	let urls = []

	for (let i = 0; i < config.sites.length; i++) {
		const site = config.sites[i]

		urls.push( site.domain )

		if ( site.alias ) urls.push( site.alias )

	}

	for (let i = 0; i < urls.length; i++) {
		const url = urls[i]

		lines.push( ''                   )
		lines.push( `127.0.0.1 ${url}`   )
		lines.push( `::1 ${url}`         )
		lines.push( `fe80::1%lo0 ${url}` )
		
	}

	lines.push( ''               )
	lines.push( `# end ${config.name}` )

	const linesRegex = new RegExp( `/(# begin ${config.name}\n.*\n# end ${config.name})/s` )
	let matches = hosts.match( linesRegex )

	if ( matches ) {
		hosts = hosts.replace( linesRegex, lines.join("\n") )
	} else {
		hosts += "\n\n" + lines.join("\n") + "\n\n"
	}

	fs.writeFileSync( config.hosts.path, hosts )

}

// APACHE VIRTUAL HOSTS
function buildApacheVirtualHosts() {

	let vhosts = fs.readFileSync( config.apache.vhostsPath, 'utf8' )

	const lines = []
	lines.push( `# begin ${config.name}` )

	// LOCALHOST
	lines.push( ''                                                  )
	lines.push( '<VirtualHost *:443>'                               )
	lines.push( `    DocumentRoot "${config.apache.documentRoot}"`  )
	lines.push( '    SSLEngine on'                                  )
	lines.push( `    SSLCertificateFile "${config.ssl.certPath}"`   )
	lines.push( `    SSLCertificateKeyFile "${config.ssl.keyPath}"` )
	lines.push( '</VirtualHost>'                                    )
	lines.push( ''                                                  )
	lines.push( '<VirtualHost *:80>'                                )
	lines.push( `    DocumentRoot "${config.apache.documentRoot}"`  )
	lines.push( '</VirtualHost>'                                    )

	for (let i = 0; i < config.sites.length; i++) {
		const site = config.sites[i]

		if ( !site.server || site.server !== 'apache' ) continue;

		lines.push( ''                                )
		lines.push( `<VirtualHost *:443>`             )
		lines.push( `    DocumentRoot "${site.path}"` )
		lines.push( `    ServerName ${site.domain}`   )

		if ( site.alias && site.alias.length ) {
		lines.push( `    ServerAlias ${site.alias}` )
		}

		lines.push( `    SSLEngine on`                                  )
		lines.push( `    SSLCertificateFile "${config.ssl.certPath}"`   )
		lines.push( `    SSLCertificateKeyFile "${config.ssl.keyPath}"` )

		if ( site.errorLog && site.errorLog.length ) {
		lines.push( `    ErrorLog "${site.errorLog}"` )
		}

		if ( site.directory && site.directory.length ) {
		lines.push( `    <Directory "${site.path}">` )
		for (let i = 0; i < site.directory.length; i++) {
		lines.push( `        ${site.directory[i]}` )
		}
		lines.push( `    </Directory>` )
		}

		lines.push( `</VirtualHost>` )

		lines.push( '' )

		lines.push( `<VirtualHost *:80>`              )
		lines.push( `    DocumentRoot "${site.path}"` )
		lines.push( `    ServerName ${site.domain}`   )

		if ( site.alias && site.alias.length ) {
		lines.push( `    ServerAlias ${site.alias}` )
		}

		if ( site.errorLog && site.errorLog.length ) {
		lines.push( `    ErrorLog "${site.errorLog}"` )
		}

		if ( site.directory && site.directory.length ) {
		lines.push( `    <Directory "${site.path}">` )
		for (let i = 0; i < site.directory.length; i++) {
		lines.push( `        ${site.directory[i]}` )
		}
		lines.push( `    </Directory>` )
		}

		lines.push( `</VirtualHost>` )

	}

	lines.push( '' )
	lines.push( `# end ${config.name}` )

	const linesRegex = new RegExp( `/(# begin ${config.name}\n.*\n# end ${config.name})/s` )
	let matches = vhosts.match( linesRegex )

	if ( matches ) {
		vhosts = vhosts.replace( linesRegex, lines.join("\n") )
	} else {
		vhosts += "\n\n" + lines.join("\n") + "\n\n"
	}

	fs.writeFileSync( config.apache.vhostsPath, vhosts )

}

function buildSSLCertificate() {

	let altNames = [
		'localhost'
	]

	for (let i = 0; i < config.sites.length; i++) {
		const site = config.sites[i]

		altNames.push( site.domain )

		if ( site.alias ) altNames.push( site.alias )

	}

	pem.createCSR({
		commonName:   `${config.name} Self-Signed SSL Certificate`,
		country:      config.ssl.country,
		state:        config.ssl.state,
		organization: config.ssl.organization,
		emailAddress: config.ssl.email,
		altNames:     altNames
	}, ( err, result ) => {

		pem.createCertificate({
			selfSigned: true,
			csr:        result.csr,
			clientKey:  result.clientKey,
		}, (err, keys) => {
	
			if ( err ) {
				console.log(err);
				return;
			}
	
			const key  = keys.serviceKey
			const cert = keys.certificate
	
			fs.writeFileSync( config.ssl.keyPath, key  )
			fs.writeFileSync( config.ssl.certPath, cert )
	
			let shellCommands = [
				`security delete-certificate -c "${config.name} Self-Signed SSL Certificate" /Library/Keychains/System.keychain`,
				`security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${config.ssl.certPath}"`,
				'brew services restart httpd'
			]
	
			exec( shellCommands.join(';'), (error, stdout, stderr) => {

				console.log(stdout)
				
			})
		
		})
	
	})

}

buildHosts()
buildApacheVirtualHosts()
buildSSLCertificate()
