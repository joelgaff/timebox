// Load a QML JS library (".pragma library" file) in Node for testing.
const fs = require("fs")
const path = require("path")
module.exports = function load(name, exportNames) {
  const src = fs.readFileSync(path.join(__dirname, "..", name), "utf8").replace(/^\.pragma library/m, "")
  return new Function(src + "\nreturn {" + exportNames.join(",") + "}")()
}
