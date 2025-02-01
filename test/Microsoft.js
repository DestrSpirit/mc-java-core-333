const { Microsoft } = require("../build/Index");
async function main() {
        let account = await new Microsoft().getAuth();
        return account;
}
main().then(console.log).catch(console.error);
