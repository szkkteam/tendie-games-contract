const { assert } = require('chai');
const truffleAssert = require('truffle-assertions');
const { expectRevert, balance } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const BN = require('bn.js');
const { debug } = require('console');


contract("CoinFlip", (accounts) => {
    const CoinFlip = artifacts.require('CoinFlip');
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

        fundContract = async(linkAmount = '10', ethAmount = '8', account = defaultAccount) => {
          // Transfer LINK to contract
          await link.transfer(coinFlip.address, web3.utils.toWei(linkAmount, 'ether'), { from: account });
          // Transfer ETH to contract
          await web3.eth.sendTransaction({ to: coinFlip.address, from: account, value: web3.utils.toWei(ethAmount, 'ether') });
        };

        describe("#flip", async () => {

          describe("##without funds", async () => {

            it('revert without LINK', async () => {
              await expectRevert.unspecified(
                coinFlip.flip(1, { from: defaultAccount , value: 10000})
              );
            });
      
            it('revert because not enough balance', async () => {
              // Transfer LINK to contract
              await link.transfer(coinFlip.address, web3.utils.toWei('1', 'ether'), { from: defaultAccount });
              // Contract has 0 funds by default
              await expectRevert.unspecified(
                coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")})
              );
            });
      
          });

          describe("##with funds", async () => {

            beforeEach(async () => {
              // Pre-fund the contract
              await fundContract();
            });

            it('revert because bet smaller than minimum', async () => {
              await expectRevert.unspecified(
                coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("0.009", "ether")})
              );
            });
      
            it('revert because bet is bigger than maximum', async () => {
              await expectRevert.unspecified(
                coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("10.1", "ether")})
              );
  
            });
  
            it('revert because previous bet not processed yet', async () => {
              await coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")});
              await expectRevert.unspecified(
                coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")})
              );
            });
  
            it('revert because lockedBets exceed balance', async () => {
              // This is a bit tricky, because the acutal balance here is not the same what the contract has. 
              // So to workaround it, we are asking for the actual balance, but multiplying it with 2 so this way we can make sure the bet will exceed the balance
              const amount = web3.utils.toWei((parseInt(web3.utils.fromWei((await balance.current(coinFlip.address)).toString(), "ether"))*2).toString(), "ether");
              await expectRevert.unspecified(
                coinFlip.flip("1", { from: account1 , value: amount})
              );
            });
  
            it('CoinFlipped event emitted', async () => {
              let transaction = await coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")});
              // Bet accepted
              truffleAssert.eventEmitted(transaction, 'CoinFlipped', { gambler: defaultAccount });
            });
  
            it('multiple account place bets', async () => {
              // account1 placeing bet
              let transaction1 = await coinFlip.flip("1", { from: account1 , value: web3.utils.toWei("1", "ether")});
              truffleAssert.eventEmitted(transaction1, 'CoinFlipped', { gambler: account1 });
  
              // account2 placeing bet
              let transaction2 = await coinFlip.flip("1", { from: account2 , value: web3.utils.toWei("1", "ether")});
              truffleAssert.eventEmitted(transaction2, 'CoinFlipped', { gambler: account2 });
  
              // account3 placeing bet
              let transaction3 = await coinFlip.flip("1", { from: account3 , value: web3.utils.toWei("1", "ether")});
              truffleAssert.eventEmitted(transaction3, 'CoinFlipped', { gambler: account3 });
            });
  
          });

        });    

        /*
                    let requestId;
            coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")}).then((reqId) => {
              requestId = reqId.logs[0].args.requestId;
            });
        */

        describe("#getWinAmount", async () => {
          it('revert because amount is 0', async () => {
            const amount = new BN(0);
            await expectRevert.unspecified(
              coinFlip.getWinAmount(amount, { from: defaultAccount })
            );
          });

          it('revert because amount does not cover house edge', async () => {
            const amount = new BN(0.1);
            await expectRevert.unspecified(
              coinFlip.getWinAmount(amount, { from: defaultAccount })
            );
          });

          it('returns with the correct win amount', async () => {
            const amount = web3.utils.toWei("2", "ether");
            const expectedAmount = web3.utils.toWei( (2 *0.99 * 2).toString(), "ether");
            let winAmount = await coinFlip.getWinAmount(new BN(amount), { from: defaultAccount });
            // 3.96 ether
            assert.equal(web3.utils.fromWei(expectedAmount.toString(), "ether"), web3.utils.fromWei(winAmount.toString(), "ether"));
          });
        });

        describe("#isBetWon", async () => {

          beforeEach(async () => {
            // Pre-fund the contract
            await fundContract();
          });

          it('returns with false', async () => {
            let requestId;
            // Place the bet
            await coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")}).then(({logs}) => {
              requestId = logs[0].args.requestId;
            });
            // Flip the coin 777 % 2 + 1 = 2
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '777', coinFlip.address, { from: defaultAccount });
            assert.equal(false, await coinFlip.isBetWon({ from: defaultAccount }));
          });

          it('returns with true', async () => {
            let requestId;
            // Place the bet
            await coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("1", "ether")}).then(({logs}) => {
              requestId = logs[0].args.requestId;
            });
            // Flip the coin 776 % 2 + 1 = 2
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '776', coinFlip.address, { from: defaultAccount });
            assert.equal(true, await coinFlip.isBetWon({ from: defaultAccount }));
          });


          it('return with false if winning already claimed', async () => {
            let account1 = accounts[1];
            let requestId;
            // Pre-fund the contract
            await fundContract();
            // Place the bet
            await coinFlip.flip("1", { from: account1 , value: web3.utils.toWei("1", "ether")}).then(({logs}) => {
              requestId = logs[0].args.requestId;
            });
            // Flip the coin 776 % 2 + 1 = 1
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '776', coinFlip.address, { from: account1 });
            await coinFlip.withdrawWinning({ from: account1 });

            assert.equal(false, await coinFlip.isBetWon({ from: account1 }));
          });
        });

        describe("#withdrawWinning", async () => {

          it('revert because called without bet', async () => {
            await expectRevert.unspecified(
              coinFlip.withdrawWinning({ from: defaultAccount })
            );
          });

          it('revert because bet not won', async () => {
            let account1 = accounts[1];
            let requestId;
            // Pre-fund the contract
            await fundContract();
            // Place the bet
            await coinFlip.flip("1", { from: account1 , value: web3.utils.toWei("1", "ether")}).then(({logs}) => {
              requestId = logs[0].args.requestId;
            });
            // Flip the coin 777 % 2 + 1 = 2
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '777', coinFlip.address, { from: account1 });
            await expectRevert.unspecified(
              coinFlip.withdrawWinning({ from: account1 })
            );
          });

          it('successfully withdraw', async () => {
            let account1 = accounts[1];
            const startBalance = await balance.current(account1);
            let requestId;
            // Pre-fund the contract
            await fundContract();
            // Place the bet
            await coinFlip.flip("1", { from: account1 , value: web3.utils.toWei("1", "ether")}).then(({logs}) => {
              requestId = logs[0].args.requestId;
            });
            let winAmount = await coinFlip.getWinAmount(new BN(web3.utils.toWei("1", "ether")), { from: account1 });
            // Flip the coin 776 % 2 + 1 = 1
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '776', coinFlip.address, { from: account1 });
            await coinFlip.withdrawWinning({ from: account1 });

            const currentBnBalance = await balance.current(account1)
            const currentBalance = parseInt(web3.utils.fromWei(currentBnBalance.toString(), "ether"))
            const calculatedBalance = parseInt(web3.utils.fromWei(startBalance.toString(), "ether")) + parseInt(web3.utils.fromWei(winAmount, "ether"))
            assert.equal(currentBalance, calculatedBalance);
            
          });


        });
        
        describe("#widthdrawFunds", async () => {

          it('revert if winner not claimed yet', async () => {
            let requestId;
            // Pre-fund the contract
            await fundContract();
            // Place the bet
            await coinFlip.flip("1", { from: account1 , value: web3.utils.toWei("1", "ether")}).then(({logs}) => {
              requestId = logs[0].args.requestId;
            });
            // Flip the coin 776 % 2 + 1 = 1
            await vrfCoordinatorMock.callBackWithRandomness(requestId, '776', coinFlip.address, { from: account1 });
            // Winner funds still in contract
            const ownerWithdrawAmount = await balance.current(coinFlip.address);
            await expectRevert.unspecified(
              coinFlip.widthdrawFunds(ownerWithdrawAmount.toString(), { from: defaultAccount })
            );
          });

          it('revert if not owner call', async () => {
            // Pre-fund the contract
            await fundContract();
            const ownerWithdrawAmount = await balance.current(coinFlip.address);
            await expectRevert.unspecified(
              coinFlip.widthdrawFunds(ownerWithdrawAmount.toString(), { from: account1 })
            );
          });
        });

    });
    
    /*
    describe("#place bet", async () => {
      beforeEach(async () => {
          keyhash = '0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4';
          fee = '1000000000000000000';
          link = await LinkToken.new({ from: defaultAccount });
          vrfCoordinatorMock = await VRFCoordinatorMock.new(link.address, { from: defaultAccount });
          coinFlip = await CoinFlip.new(vrfCoordinatorMock.address, link.address, keyhash, fee, { from: defaultAccount });
      })

        it('it revert without LINK', async () => {
            await expectRevert.unspecified(
              coinFlip.flip(1, { from: defaultAccount , value: 10000})
            );
        });

        it('it returns with a bet placed', async () => {
          await link.transfer(coinFlip.address, web3.utils.toWei('100', 'ether'), { from: defaultAccount });
          await web3.eth.sendTransaction({ to: coinFlip.address, from: defaultAccount, value: web3.utils.toWei('25', 'ether') });

          let transaction = await coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("10", "ether")});
          //await debug (coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("10", "ether")}));
          console.log("transaction: ", transaction);

          let requestId;
          truffleAssert.eventEmitted(transaction, 'BetPlaced', (ev) => {
            //console.log("Event: ", ev);
            requestId = ev.requestId;
            return true;
            return ev.param1 === 10 && ev.param2 === ev.param3;
          });
          //await debug (coinFlip.flip("1", { from: defaultAccount , value: web3.utils.toWei("10", "ether")}));

          //console.log("Transaction: ", transaction);
          //assert.exists(transaction.receipt.rawLogs);
          //let requestId = transaction.receipt.rawLogs[3].topics[0];
          console.log("requestId: ", requestId);
          let randomGenerated = await vrfCoordinatorMock.callBackWithRandomness(requestId, '776', coinFlip.address, { from: defaultAccount });
          console.log("randomGenerated: ", randomGenerated)
          
          let isWon = await coinFlip.isBetWon({ from: defaultAccount });
          //await debug (coinFlip.isBetWon({ from: defaultAccount }));
          console.log("isWon: ", isWon);
        });
      
    })
    */
    
    /*
    describe("adopting a pet and retrieving account addresses", async () => {
      before("adopt a pet using accounts[0]", async () => {
        await adoption.adopt(8, { from: accounts[0] });
        expectedAdopter = accounts[0];
      });
   
      it("can fetch the address of an owner by pet id", async () => {
       const adopter = await adoption.adopters(8);
       assert.equal(adopter, expectedAdopter, "The owner of the adopted pet should be the first account.");
     });
   
     it("can fetch the collection of all pet owners' addresses", async () => {
       const adopters = await adoption.getAdopters();
       assert.equal(adopters[8], expectedAdopter, "The owner of the adopted pet should be in the collection.");
      });
    });
    */
   });