const fs       = require('fs')
const YAML     = require('yaml')
const pem      = require('pem')
const { exec } = require('child_process')

class amethystSites {

	constructor() {
		this.config = YAML.parse( fs.readFileSync('./config.yml', 'utf8') )
	}

	build() {
		this.buildHosts()
		this.buildApacheVirtualHosts()
		this.buildSSLCertificate()
		this.buildTags()
	}

	// HOSTS
	buildHosts() {

		let hosts = fs.readFileSync( this.config.hosts.path, 'utf8' )

		const lines = [
			`# begin ${this.config.name}`
		]

		const urls = []

		for (let i = 0; i < this.config.sites.length; i++) {
			const site = this.config.sites[i]

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

		lines.push( '' )
		lines.push( `# end ${this.config.name}` )

		const pattern = new RegExp( `(# begin ${this.config.name}\n.*\n# end ${this.config.name})`, 's' ),
			  matches = hosts.match( pattern )

		if ( matches ) {
			hosts = hosts.replace( pattern, lines.join("\n") )
		} else {
			hosts += "\n\n" + lines.join("\n") + "\n\n"
		}

		fs.writeFileSync( this.config.hosts.path, hosts )

	}

	// APACHE VIRTUAL HOSTS
	buildApacheVirtualHosts() {

		let vhosts = fs.readFileSync( this.config.apache.vhostsPath, 'utf8' )

		const lines = [
			`# begin ${this.config.name}`
		]

		// LOCALHOST
		lines.push( ''                                                       )
		lines.push( '<VirtualHost *:443>'                                    )
		lines.push( `    DocumentRoot "${this.config.apache.documentRoot}"`  )
		lines.push( '    SSLEngine on'                                       )
		lines.push( `    SSLCertificateFile "${this.config.ssl.certPath}"`   )
		lines.push( `    SSLCertificateKeyFile "${this.config.ssl.keyPath}"` )
		lines.push( '</VirtualHost>'                                         )
		lines.push( ''                                                       )
		lines.push( '<VirtualHost *:80>'                                     )
		lines.push( '    Redirect 301 / https://localhost/'                  )
		lines.push( '</VirtualHost>'                                         )

		for (let i = 0; i < this.config.sites.length; i++) {
			const site = this.config.sites[i]

			if ( !site.server || site.server !== 'apache' ) continue;

			let documentRoot = site?.public ?? site?.path

			// HTTPS
			lines.push( ''                                )
			lines.push( `<VirtualHost *:443>`             )
			lines.push( `    DocumentRoot "${documentRoot}"` )
			lines.push( `    ServerName ${site.domain}`   )

			if ( site.alias && site.alias.length ) {
			lines.push( `    ServerAlias ${site.alias}` )
			}

			lines.push( `    SSLEngine on`                                  )
			lines.push( `    SSLCertificateFile "${this.config.ssl.certPath}"`   )
			lines.push( `    SSLCertificateKeyFile "${this.config.ssl.keyPath}"` )

			if ( site.errorLog && site.errorLog.length ) {
			lines.push( `    ErrorLog "${site.errorLog}"` )
			}

			if ( site.directory && site.directory.length ) {
			lines.push( `    <Directory "${documentRoot}">` )
			for (let i = 0; i < site.directory.length; i++) {
			lines.push( `        ${site.directory[i]}` )
			}
			lines.push( `    </Directory>` )
			}

			lines.push( `</VirtualHost>` )

			lines.push( '' )

			// HTTP
			lines.push( `<VirtualHost *:80>`                          )
			lines.push( `    ServerName ${site.domain}`               )
			lines.push( `    ServerAlias ${site.alias}`               )
			lines.push( `    Redirect 301 / https://${site.domain}/ ` )
			lines.push( `</VirtualHost>` )

		}

		lines.push( '' )
		lines.push( `# end ${this.config.name}` )

		const pattern = new RegExp( `(# begin ${this.config.name}\n.*\n# end ${this.config.name})`, 's' ),
		      matches = vhosts.match( pattern )

		if ( matches ) {
			vhosts = vhosts.replace( pattern, lines.join("\n") )
		} else {
			vhosts += "\n\n" + lines.join("\n") + "\n\n"
		}

		fs.writeFileSync( this.config.apache.vhostsPath, vhosts )

	}

	buildSSLCertificate() {

		let altNames = [
			'localhost'
		]

		for (let i = 0; i < this.config.sites.length; i++) {
			const site = this.config.sites[i]

			altNames.push( site.domain )

			if ( site.alias ) altNames.push( site.alias )

		}

		pem.createCSR({
			commonName:   `${this.config.name} Self-Signed SSL Certificate`,
			country:      this.config.ssl.country,
			state:        this.config.ssl.state,
			organization: this.config.ssl.organization,
			emailAddress: this.config.ssl.email,
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

				fs.writeFileSync( this.config.ssl.keyPath,  key  )
				fs.writeFileSync( this.config.ssl.certPath, cert )

				let shellCommands = [
					`security delete-certificate -c "${this.config.name} Self-Signed SSL Certificate" /Library/Keychains/System.keychain`,
					`security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${this.config.ssl.certPath}"`,
				]

				exec( shellCommands.join(';'), (error, stdout, stderr) => console.log(stdout) )

			})

		})

	}

	buildTags() {

		for (let i = 0; i < this.config.sites.length; i++) {
			const site = this.config.sites[i]

			let shellCommands = [
				`tag -a "Sites" "${site.path}"`
			]

			if ( site.app && site.app === 'wordpress' ) {
				
				shellCommands.push(`tag -a "WordPress" "${site.path}"`)
			}

			if ( shellCommands.length ) {
				exec( shellCommands.join(';'), (error, stdout, stderr) => console.log(stdout) )
			}

		}

	}

}

( new amethystSites ).build()
