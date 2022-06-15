import path from 'path'
import fs from 'fs'
import url from 'url'
import Server from './Server'
import Crawler from './Crawler'
import Writer from './Writer'
import program from 'safe-commander'

export default async () => {
  program
    .version(require('../package.json').version)
    .option('--build-dir <directory>', `Specify where the JS app lives. Defaults to 'build'`)
    .option('--domain <domain>', `The local domain to use for scraping. Defaults to 'localhost'`)
    .option('--output-dir <directory>', `Where to write the snapshots. Defaults to in-place (i.e. same as build-dir)`)
    .parse(process.argv)

  const {
    buildDir = 'build',
    domain = 'localhost',
    outputDir = buildDir,
  } = program.optsObj

  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')))
  const basename = ((p) => p.endsWith('/') ? p : p + '/')(pkg.homepage ? url.parse(pkg.homepage).pathname : '')

  const options = Object.assign({
    include: [],
    exclude: [],
    snapshotDelay: 50,
  }, pkg['react-snapshot'] || pkg.reactSnapshot || {})

  options.exclude = options.exclude.map((p) => path.join(basename, p).replace(/\\/g, '/'))
  options.include = options.include.map((p) => path.join(basename, p).replace(/\\/g, '/'))
  options.include.unshift(basename)

  const buildDirPath = path.resolve(`./${buildDir}`)
  const outputDirPath = path.resolve(`./${outputDir}`)
  if (!fs.existsSync(buildDir)) throw new Error(`No build directory exists at: ${buildDirPath}`)
  const writer = new Writer(buildDirPath, outputDirPath)
  writer.move('index.html', '_template.html')

  const server = new Server(buildDirPath, basename, 0, pkg.proxy)
  await server.start();
  
  const crawler = new Crawler(`http://${domain}:${server.port()}${basename}`, options.snapshotDelay, options)
  await crawler.crawl(({ urlPath, html }) => {
    if (!urlPath.startsWith(basename)) {
      console.log(`❗ Refusing to crawl ${urlPath} because it is outside of the ${basename} sub-folder`)
      return
    }
    urlPath = urlPath.replace(basename, '/')
    let filename = urlPath
    //if (urlPath.endsWith('/')) {
    
    filename = `${urlPath}${urlPath.endsWith("/") ? "" : "/"}index.html`
    //} else if (path.extname(urlPath) == '') {
    //  filename = `${urlPath}.html`
    //}
    console.log(`✏️   Saving ${urlPath} as ${filename}`)
    writer.write(filename, html)
  })

  const assets = require(buildDirPath + "/asset-manifest.json");
  delete assets.files["index.html"];
  assets.files["_template.html"] = "_template.html";
  fs.writeFileSync(buildDirPath + "/asset-manifest.json", JSON.stringify(assets, null, 2));
  console.log(" - Updated assets-manifest.json")
  
  fs.writeFileSync(buildDirPath + "/routes-manifest.json", JSON.stringify(crawler.routesManifest, null, 2));
  console.log(" - Created routes-manifest.json")
  
  server.stop(), err => console.log(`🔥 ${err}`)
}
