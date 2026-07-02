const http = require('http');
const server = http.createServer((req, res) => {
	res.write('hello tue tueh');
	res.end();
});

server.listen(3000)

console.log('server running on 3000')


