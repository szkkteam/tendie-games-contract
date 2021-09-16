var CoinFlip = artifacts.require("CoinFlip");
const { LinkToken } = require('@chainlink/contracts/truffle/v0.4/LinkToken')

module.exports = async (deployer, network, [defaultAccount]) => {
    /*
    vrfCoordinator = "0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9";
    keyHash = "0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4";
    link = "0xa36085F69e2889c224210F603D836748e7dC0088";
    fee = 0.1
    */
    if (network.startsWith('kovan')) {
        // For now, this is hard coded to Kovan
        const KOVAN_KEYHASH = '0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4';
        const KOVAN_FEE = '100000000000000000';
        const KOVAN_LINK_TOKEN = '0xa36085F69e2889c224210F603D836748e7dC0088';
        const KOVAN_VRF_COORDINATOR = '0xdD3782915140c8f3b190B5D67eAc6dc5760C46E9';
        deployer.deploy(CoinFlip, KOVAN_VRF_COORDINATOR, KOVAN_LINK_TOKEN, KOVAN_KEYHASH, KOVAN_FEE);

    } else if (network.startsWith('matic_mumbai')) {
        // For now, this is hard coded to Kovan
        const MATIC_KEYHASH = '0x6e75b569a01ef56d18cab6a8e71e6600d6ce853834d4a5748b720d06f878b3a4';
        const MATIC_FEE = '100000000000000';
        const MATIC_LINK_TOKEN = '0x326C977E6efc84E512bB9C30f76E30c160eD06FB';
        const MATIC_VRF_COORDINATOR = '0x8C7382F9D8f56b33781fE506E897a4F1e2d17255';
        deployer.deploy(CoinFlip, MATIC_VRF_COORDINATOR, MATIC_LINK_TOKEN, MATIC_KEYHASH, MATIC_FEE);
    } else {
        LinkToken.setProvider(deployer.provider)
        try {
            await deployer.deploy(LinkToken, { from: defaultAccount })
        } catch (err) {
            console.error(err)
        }
    }
};

