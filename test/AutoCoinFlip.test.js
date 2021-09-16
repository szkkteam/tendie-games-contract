const { assert } = require('chai');
const truffleAssert = require('truffle-assertions');
const { expectRevert, balance } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const BN = require('bn.js');
const { debug } = require('console');


contract("AutoCoinFlip", (accounts) => {
    const CoinFlip = artifacts.require('AutoCoinFlip');
    const VRFCoordinatorMock = artifacts.require('VRFCoordinatorMock');
    const { LinkToken } = require('@chainlink/contracts/truffle/v0.4/LinkToken');
    const defaultAccount = accounts[0];
    const account1 = accounts[1];
    const account2 = accounts[2];
    const account3 = accounts[3];
    const account4 = accounts[4];
    let coinFlip, vrfCoordinatorMock, link, keyhash, fee;
      
    describe("#unit tests", async () => {

        beforeEach(async () => {
            keyhash = '0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4';
            fee = '1000000000000000000';
            link = await LinkToken.new({ from: defaultAccount });
            vrfCoordinatorMock = await VRFCoordinatorMock.new(link.address, { from: defaultAccount });
            coinFlip = await CoinFlip.new(vrfCoordinatorMock.address, link.address, keyhash, fee, { from: defaultAccount });
        });
    })
});