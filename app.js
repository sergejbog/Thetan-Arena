const https = require("https");
const Web3 = require("web3");
const Tx = require("ethereumjs-tx");
const Common = require("ethereumjs-common");
const { time } = require("console");
const abiDecoder = require("abi-decoder");
const BlocknativeSdk = require("bnc-sdk");
const WebSocket = require("ws");
const Agent = require("agentkeepalive").HttpsAgent;
const EventEmitter = require("events");
const { google } = require("googleapis");
const config = require("./config.json");
const { sdkSetup } = require("./sdk-setup.js");
const blocknativeConfiguration = require("./configuration.json");

function httpRequest(url, headers = {}) {
   return new Promise(function (resolve, reject) {
      var req = https.get(url, { headers, agent: keepaliveAgent }, function (res) {
         if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error("statusCode=" + res.statusCode));
         }
         var body = [];
         res.on("data", function (chunk) {
            body.push(chunk);
         });
         res.on("end", function () {
            try {
               body = JSON.parse(Buffer.concat(body).toString());
            } catch (e) {
               reject(e);
            }
            resolve(body["data"]);
         });
      });
      req.on("error", function (err) {
         reject(err);
      });
      req.end();
   });
}
function sleep(ms) {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values) {
   if (values.length === 0) throw new Error("No inputs");

   values.sort(function (a, b) {
      return a - b;
   });

   var half = Math.floor(values.length / 2);

   if (values.length % 2) return values[half];

   return (values[half - 1] + values[half]) / 2.0;
}

const keepaliveAgent = new Agent({
   maxSockets: 100,
   maxFreeSockets: 10,
   freeSocketTimeout: 30000, // free socket keepalive for 30 seconds
});

const blocknative = new BlocknativeSdk({
   dappId: config["blocknativeApi"],
   networkId: 56,
   transactionHandlers: [getAllPending],
   ws: WebSocket,
   onerror: (error) => {
      console.log(error);
   },
});
sdkSetup(blocknative, blocknativeConfiguration);

const common = Common.default.forCustomChain(
   "mainnet",
   {
      name: "bnb",
      networkId: 56,
      chainId: 56,
   },
   "petersburg"
);
const authMarketplace = config["Auth"];
const ContractABI = config["ContractABI"];
const MarketplaceAddress = config["MarketplaceAddress"];
const HeroContactAddress = config["HeroContactAddress"];
const HeroContractABI = config["HeroContractABI"];
const isS = config["isS"];
const mainAddress = config["mainAddress"];
const mainAddressPrivateKey = config["buyingAccountPrivateKey"];
const buyingAddresPrivateKeyBuffer = Buffer.from(mainAddressPrivateKey, "hex");
const sellingAddress = "";
const sellingAddresPrivateKey = config["sellingAccountPrivateKey"];
const sellingAddresPrivateKeyBuffer = Buffer.from(sellingAddresPrivateKey, "hex");
const bsc = config["quickNode"];

const AAddress = "";
const Saddress = "";
const nftAddress = "98eb46cbf76b19824105dfbcfa80ea8ed020c6f4";
const wbnbAddress = "24802247bD157d771b7EFFA205237D8e9269BA8A";

const web3 = new Web3(new Web3.providers.WebsocketProvider(bsc), {
   reconnect: {
      auto: true,
      delay: 5000,
      maxAttempts: 20,
      onTimeout: false,
   },
});
const marketplaceContract = new web3.eth.Contract(ContractABI, MarketplaceAddress);
const heroContract = new web3.eth.Contract(HeroContractABI, HeroContactAddress);
const web3Account = web3.eth.accounts.privateKeyToAccount(sellingAddresPrivateKey);
abiDecoder.addABI(ContractABI);

const heroRarityDict = {
   0: "Common",
   1: "Epic",
   2: "Legendary",
};
const heroRarityWinThcDic = {
   0: 9.25,
   1: 12.5,
   2: 29.55,
};
const skinRarityDict = {
   0: "Normal",
   1: "Rare",
   2: "Mythical",
};

class GoogleSheetsProvider {
   constructor(auth) {
      this.auth = auth;
   }

   set googleSheetsApi(googleSheets) {
      this.googleSheets = googleSheets;
   }

   async getCurrentWinrateForChamps(spreadsheetId) {
      let maxWinratePerChamp = {};
      let dateNow = new Date();
      dateNow.setHours(dateNow.getHours());
      let timestampNow = Math.round(dateNow.getTime() / 1000);
      let timestampBefore = timestampNow - minimumHour;
      let dateBefore = new Date(timestampBefore * 1000);

      console.log(dateNow.toLocaleString());
      console.log(dateBefore.toLocaleString());

      if (dateBefore.getDay() != dateNow.getDay()) {
         let dateArr = dateNow.toLocaleDateString("en-US").split("/");
         let dateStringNow = dateArr[1] + "-" + dateArr[0];

         dateArr = dateBefore.toLocaleDateString("en-US").split("/");
         let dateStringBefore = dateArr[1] + "-" + dateArr[0];

         const requestNow = {
            spreadsheetId: spreadsheetId,
            ranges: dateStringNow,
            auth: auth,
         };

         const requestBefore = {
            spreadsheetId: spreadsheetId,
            ranges: dateStringBefore,
            auth: auth,
         };

         try {
            let responseDataNow = (await this.googleSheets.spreadsheets.values.batchGet(requestNow)).data["valueRanges"][0]["values"];

            let filteredArrayNow = responseDataNow.filter((elem) => {
               let dateArrayFromRequest = elem[3].split(":");
               let dateElement = new Date();
               dateElement.setHours(dateArrayFromRequest[0], dateArrayFromRequest[1], dateArrayFromRequest[2]);
               dateElement.setDate(dateNow.getDate());
               return dateElement.getTime() > dateBefore.getTime();
            });

            responseDataNow = (await this.googleSheets.spreadsheets.values.batchGet(requestBefore)).data["valueRanges"][0]["values"];

            let filteredArrayBefore = responseDataNow.filter((elem) => {
               let dateArrayFromRequest = elem[3].split(":");
               let dateElement = new Date();
               dateElement.setHours(dateArrayFromRequest[0], dateArrayFromRequest[1], dateArrayFromRequest[2]);
               dateElement.setDate(dateBefore.getDate());
               return dateElement.getTime() > dateBefore.getTime();
            });

            let addedFilteredArrays = [...filteredArrayBefore, ...filteredArrayNow];
            addedFilteredArrays = addedFilteredArrays.map((elem) => {
               maxWinratePerChamp[elem[0]] = [];
               return [elem[0], parseFloat(elem[15])];
            });

            addedFilteredArrays.forEach((elem) => {
               if (elem[1] == "Infinity" || parseFloat(elem[1]) > 70 || parseFloat(elem[1]) < 20) return;
               maxWinratePerChamp[elem[0]].push(elem[1]);
            });

            for (const heroName in maxWinratePerChamp) {
               try {
                  let medianWinrate = await median(maxWinratePerChamp[heroName]);
                  if (medianWinrate > 55) medianWinrate = 55;
                  maxWinratePerChamp[heroName] = medianWinrate;
               } catch (err) {
                  console.log(err);
               }
            }
            maxWinratePerChamp["Velvet"] = 55;
            return maxWinratePerChamp;
         } catch (err) {
            console.error(err);
         }
      } else if (dateBefore.getDay() == dateNow.getDay()) {
         let dateArr = dateNow.toLocaleDateString("en-US").split("/");
         let dateStringNow = dateArr[1] + "-" + dateArr[0];

         const requestNow = {
            spreadsheetId: spreadsheetId,
            ranges: dateStringNow,
            auth: auth,
         };

         try {
            let responseDataNow = (await this.googleSheets.spreadsheets.values.batchGet(requestNow)).data["valueRanges"][0]["values"];

            let filteredArrayNow = responseDataNow.filter((elem) => {
               let dateArrayFromRequest = elem[3].split(":");
               let dateElement = new Date();
               dateElement.setHours(dateArrayFromRequest[0], dateArrayFromRequest[1], dateArrayFromRequest[2]);
               dateElement.setDate(dateNow.getDate());
               return dateElement.getTime() > dateBefore.getTime();
            });

            filteredArrayNow = filteredArrayNow.map((elem) => {
               maxWinratePerChamp[elem[0]] = [];
               return [elem[0], parseFloat(elem[15])];
            });

            filteredArrayNow.forEach((elem) => {
               if (elem[1] == "Infinity" || parseFloat(elem[1]) > 70 || parseFloat(elem[1]) < 20) return;
               maxWinratePerChamp[elem[0]].push(elem[1]);
            });

            for (const heroName in maxWinratePerChamp) {
               let medianWinrate = await median(maxWinratePerChamp[heroName]);
               if (medianWinrate > 55) medianWinrate = 55;
               maxWinratePerChamp[heroName] = medianWinrate;
            }
            maxWinratePerChamp["Velvet"] = 55;
            return maxWinratePerChamp;
         } catch (err) {
            console.error(err);
         }
      }
   }

   async writeBidToGoogle(listing, txReceipt, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice) {
      let spreadsheetId = "";
      let txHash = txReceipt["transactionHash"];
      let tx = await web3.eth.getTransaction(txHash);
      let auth = this.auth;
      let gwei = web3.utils.fromWei(tx["gasPrice"]);
      let gasUsed = txReceipt["gasUsed"];
      let feePrice = gwei * gasUsed;
      let feePriceInThc = (feePrice * currentWBNBPrice) / currentThcPrice;
      let price = listing["price"] / 100000000;
      let totalPrice = feePriceInThc + price;
      let nowDate = new Date();
      nowDate.setHours(nowDate.getHours() + 1);

      if (txReceipt["status"]) {
         await this.googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: "Purchased",
            valueInputOption: "USER_ENTERED",
            resource: {
               values: [
                  [
                     mainAddress.toLowerCase() == Saddress.toLowerCase() ? "S" : "A",
                     listing["id"],
                     listing["name"],
                     heroRarityDict[listing["heroRarity"]],
                     skinRarityDict[listing["skinRarity"]],
                     listing["battleCap"],
                     breakEvenWinrateWithFee,
                     "",
                     nowDate.toLocaleString("en-US"),
                     "",
                     "",
                     price,
                     gwei * 10 ** 9,
                     feePriceInThc,
                     totalPrice,
                     suggestedPrice.toFixed(3),
                     "",
                     "",
                     "",
                     "",
                     "",
                     "",
                     listing["refId"],
                     listing["tokenId"],
                  ],
               ],
            },
         });
         await this.googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: "Relist",
            valueInputOption: "USER_ENTERED",
            resource: {
               values: [
                  [
                     mainAddress,
                     listing["id"],
                     suggestedPrice.toFixed(3),
                     maxWinrate,
                     nowDate.getTime(),
                     0,
                     currentThcPrice,
                     listing["battleCap"],
                     heroRarityDict[listing["heroRarity"]],
                     currentWBNBPrice,
                     listing["tokenId"],
                  ],
               ],
            },
         });
      } else {
         await this.googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: "Bids",
            valueInputOption: "USER_ENTERED",
            resource: {
               values: [
                  [
                     mainAddress.toLowerCase() == Saddress.toLowerCase() ? "S" : "A",
                     listing["name"],
                     skinRarityDict[listing["skinRarity"]],
                     listing["battleCap"],
                     nowDate.toLocaleString("en-US"),
                     gwei * 10 ** 9,
                     feePrice,
                     txHash,
                  ],
               ],
            },
         });
      }
   }
}

const auth = new google.auth.GoogleAuth({
   keyFile: "./google-credentials.json",
   scopes: "https://www.googleapis.com/auth/spreadsheets",
});
let googleSheetsProvider = new GoogleSheetsProvider(auth);

const increaseGwei = config["gweiIncrease"];
const winrateMargin = {
   Common: 1.5,
   Epic: 2,
   Legendary: 2.5,
};
const thcMargin = 1;
const maxPriceCommon = 800;
const maxPriceEpic = 1800;
const maxLegendaryPrice = 6500;
const hoursInSeconds = 3600;
const minimumHour = hoursInSeconds * 24;
const minimumProfit = 0.01;

const buyingContractAddress = "0x52Bc95c5A6b1F4d812eD186635a4fA0fDa27F662";

const pendingTransactionsEmmiter = new EventEmitter();
let pendingTransactionsObj = {};

function getAllPending(event) {
   let transaction = event.transaction;
   let signaturePending = transaction["contractCall"]["params"]["signature"].toLowerCase();
   let date = new Date();
   let gasPrice = parseInt(transaction["gasPriceGwei"]);
   let pendingTimeStamp = transaction["pendingTimeStamp"];
   let nonce = transaction["nonce"];

   console.log([
      `From: ${transaction["from"]}`,
      `Signature: ${signaturePending}`,
      `Timestamp: ${date.toISOString()}`,
      `Gas Price: ${gasPrice}`,
      `Pending time Stamp: ${pendingTimeStamp}`,
      `Nonce: ${nonce}`,
   ]);
   if (transaction["from"].toLowerCase() == AAddress.toLowerCase() || transaction["from"].toLowerCase() == Saddress.toLowerCase()) return;
   pendingTransactionsEmmiter.emit(signaturePending, gasPrice);
   if (!pendingTransactionsObj[signaturePending] || pendingTransactionsObj[signaturePending] < gasPrice) pendingTransactionsObj[signaturePending] = gasPrice;
}

function prepareTransaction(nonce, myData, gweiToPay, addressTo, privateKeyBuffer, addressFrom) {
   const txObject = {
      chainId: 56,
      nonce: web3.utils.toHex(nonce),
      to: addressTo,
      from: addressFrom,
      value: 0,
      gasLimit: web3.utils.toHex(400000),
      gasPrice: web3.utils.toHex(web3.utils.toWei(gweiToPay.toString(), "gwei")),
      data: myData,
   };

   const tx = new Tx.Transaction(txObject, { common });
   tx.sign(privateKeyBuffer);
   const serializedTx = tx.serialize();
   const raw = "0x" + serializedTx.toString("hex");
   return raw;
}

function prepareTransactionClosure(nonce, myData, addressTo, privateKeyBuffer, addressFrom) {
   return (gweiToPay) => {
      return prepareTransaction(nonce, myData, gweiToPay, addressTo, privateKeyBuffer, addressFrom);
   };
}

async function makeTransaction(listing, price, gweiLimit, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice, isItCheap, nonce) {
   let nftId = listing["id"];
   let tokenId = listing["tokenId"];
   let ownerAddress = listing["ownerAddress"];
   let isOwner = true;

   let signatureReq = httpRequest(`https://data.thetanarena.com/thetan/v1/items/${nftId}/signed-signature?id=${nftId}`, {
      Authorization: `Bearer ${authMarketplace}`,
   }).catch((err) => {
      console.log(err);
   });
   let saltNonceReq = httpRequest(`https://data.thetanarena.com/thetan/v1/items/${nftId}?id=${nftId}`).catch((err) => {
      console.log(err);
   });
   let checkOwnerPromise = heroContract.methods
      .ownerOf(tokenId)
      .call()
      .then((res) => {
         if (ownerAddress.toLowerCase() != res.toLowerCase()) {
            console.log("\x1b[33m%s\x1b[0m", "Real Owner: " + res + " False Owner: " + ownerAddress);
            isOwner = false;
         }
      });

   try {
      let requestDataArray = await Promise.all([signatureReq, saltNonceReq]).catch((err) => {
         console.log(err);
      });

      signature = requestDataArray[0].toLowerCase();

      let gweiToPay = Math.floor(Math.random() * (20 - 15 + 1) + 15);
      if (isItCheap) gweiToPay = 5;
      if (pendingTransactionsObj[signature] && pendingTransactionsObj[signature] >= parseInt(gweiToPay) && pendingTransactionsObj[signature] <= gweiLimit) {
         gweiToPay = parseInt(pendingTransactionsObj[signature] + (Math.floor(Math.random() * 30) + 1));
      } else if (pendingTransactionsObj[signature] && pendingTransactionsObj[signature] > gweiLimit) {
         console.log("Max Gwei too high!");
         return;
      }

      let saltNonce = requestDataArray[1]["saltNonce"];
      let addresArr = [ownerAddress, "0x" + nftAddress, "0x" + wbnbAddress];
      let values = [web3.utils.toHex(parseInt(tokenId)), web3.utils.toHex(web3.utils.toWei(price.toString())), web3.utils.toHex(saltNonce)];
      let myData = await web3.eth.abi.encodeFunctionCall(
         {
            name: "doStuff",
            type: "function",
            inputs: [
               {
                  type: "address[3]",
                  name: "addresses",
               },
               {
                  type: "uint256[3]",
                  name: "values",
               },
               {
                  type: "bytes",
                  name: "signature",
               },
            ],
         },
         [addresArr, values, signature]
      );

      const prepareTransactionMaker = prepareTransactionClosure(nonce, myData, buyingContractAddress, buyingAddresPrivateKeyBuffer, mainAddress);

      let raw = prepareTransactionMaker(gweiToPay);

      await checkOwnerPromise;
      if (!isOwner) return;

      console.log(`Gwei: ${gweiToPay}`);
      console.log("Start TX: " + new Date().toISOString());

      sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice, isItCheap);

      let dateForInterval = Date.now();
      async function pendingTransactionListen(pendingGwei) {
         //remove Listener
         if (Date.now() - dateForInterval > 3000 || pendingGwei >= gweiLimit) {
            //remove Listener
            pendingTransactionsEmmiter.removeListener(signature, pendingTransactionListen);
            console.log(`Ending Emmiter at: ${Date.now()}`);
            return;
         }

         if (pendingGwei < gweiToPay) return;

         // First Re-send transaction
         gweiToPay = parseInt(pendingGwei + 1);
         if (gweiToPay > gweiLimit) {
            //remove Listener
            console.log("Sending gwei limit");
            gweiToPay = parseInt(gweiLimit);
            raw = prepareTransactionMaker(gweiToPay);
            sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);
            pendingTransactionsEmmiter.removeListener(signature, pendingTransactionListen);
            return;
         }
         raw = prepareTransactionMaker(gweiToPay);
         console.log(`Gwei to Pay: ${gweiToPay} at time ${new Date().toISOString()}`);
         sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);
         // Second Re-send transaction
         gweiToPay = parseInt(gweiToPay * increaseGwei);
         if (gweiToPay > gweiLimit) {
            //remove Listener
            console.log("Sending gwei limit");
            gweiToPay = parseInt(gweiLimit);
            raw = prepareTransactionMaker(gweiToPay);
            sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);
            pendingTransactionsEmmiter.removeListener(signature, pendingTransactionListen);
            return;
         }
         console.log(`Gwei to 2nd Time: ${gweiToPay}`);
         raw = prepareTransactionMaker(gweiToPay);
         await sleep(200);
         console.log(new Date().toISOString());
         sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);

         gweiToPay = parseInt(gweiToPay * increaseGwei);
         if (gweiToPay > gweiLimit) {
            //remove Listener
            console.log("Sending gwei limit");
            gweiToPay = parseInt(gweiLimit);
            raw = prepareTransactionMaker(gweiToPay);
            sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);
            pendingTransactionsEmmiter.removeListener(signature, pendingTransactionListen);
            return;
         }
         console.log(`Gwei to 3rd Time: ${gweiToPay}`);
         raw = prepareTransactionMaker(gweiToPay);
         await sleep(100);
         console.log(new Date().toISOString());
         sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);
      }
      pendingTransactionsEmmiter.on(signature, pendingTransactionListen);
   } catch (err) {
      console.log("D");
      console.log(err);
      console.log("End2: " + Date.now());
   }
}

async function sendTransaction(raw, listing, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice, isItCheap) {
   web3.eth
      .sendSignedTransaction(raw)
      .on("receipt", async (receipt) => {
         console.log();
         console.log("\x1b[32m%s\x1b[0m", "------------------");
         console.log("\x1b[32m%s\x1b[0m", "TRUE");
         console.log("\x1b[32m%s\x1b[0m", "------------------");
         console.log();

         googleSheetsProvider.writeBidToGoogle(listing, receipt, breakEvenWinrateWithFee, suggestedPrice, maxWinrate, currentThcPrice, currentWBNBPrice);
         await sleep(240000);
         let data = await heroContract.methods.transferFrom(sellingAddress, sellingAddress, listing["tokenId"]).encodeABI();
         nonce = await web3.eth.getTransactionCount(sellingAddress).catch((err) => {
            console.log(err);
         });
         let raw = prepareTransaction(nonce, data, 5, HeroContactAddress, sellingAddresPrivateKeyBuffer, sellingAddress);
         await web3.eth.sendSignedTransaction(raw).on("receipt", async (receipt) => {
            if (!isItCheap) listHero(listing["id"], parseInt(suggestedPrice));
         });
      })
      .on("error", (err, receipt) => {
         console.log(err);
         if (!receipt) return;
         console.log();
         console.log("\x1b[31m%s\x1b[0m", "------------------");
         console.log("\x1b[31m%s\x1b[0m", "FALSE");
         console.log("\x1b[31m%s\x1b[0m", "------------------");
         console.log();
         googleSheetsProvider.writeBidToGoogle(listing, receipt);
      });
}

async function listHero(id, price) {
   await sleep(240000);
   console.log(price);
   price = parseInt(price * 10 ** 8);
   console.log(price);
   const url = `https://data.thetanarena.com/thetan/v1/user-items/${id}/hash-message?id=${id}&paymentTokenId=61795fdb6360d68a36ecab01&SystemCurrency.Type=11&SystemCurrency.Name=THC&SystemCurrency.Value=${price}&SystemCurrency.Decimals=8`;
   let signatureReq = await httpRequest(url, {
      Authorization: `Bearer ${authMarketplace}`,
   }).catch((err) => {
      console.log(err);
   });
   console.log(url);
   console.log(signatureReq);
   const signature = await web3Account.sign(signatureReq);
   console.log(signature);
   const paymentTokenId = "61795fdb6360d68a36ecab01";

   const data = JSON.stringify({
      id: id,
      paymentTokenId: paymentTokenId,
      signedSignature: signature["signature"],
      systemCurrency: {
         type: 11,
         value: price,
         decimals: 8,
         name: "THC",
      },
   });

   console.log(data);

   const options = {
      hostname: "data.thetanarena.com",
      path: `/thetan/v1/user-items/${id}/sale`,
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         "Content-Length": data.length,
         Authorization: `Bearer ${authMarketplace}`,
      },
   };

   const req = https.request(options, (res) => {
      if (res.statusCode == 200) {
         console.log();
         console.log("Hero has been listed");
         console.log();

         res.on("data", (d) => {
            process.stdout.write(d);
         });
      }
   });

   req.on("error", (error) => {
      console.error(error);
   });

   req.write(data);
   req.end();
}

function breakEvenWinrateWithFeeFunction(price, gamesToPlay, heroWinThc) {
   let heroPriceWithFee = price * 1.04;
   let breakEvenWinrateWithFee = ((heroPriceWithFee - gamesToPlay) / (gamesToPlay * heroWinThc - gamesToPlay)) * 100;
   return breakEvenWinrateWithFee;
}

function maxWinrateInThcFunction(maxWinrate, gamesToPlay, heroWinThc) {
   let maxWinrateThcEarned = (gamesToPlay * (maxWinrate / 100) * heroWinThc + gamesToPlay * (1 - maxWinrate / 100)) * 0.96;
   return maxWinrateThcEarned;
}

function maxWinrateInWbnbWithFeeFunction(maxWinrate, gamesToPlay, heroWinThc, currentThcPrice, currentWBNBPrice) {
   let maxWinrateThcEarned = (gamesToPlay * (maxWinrate / 100) * heroWinThc + gamesToPlay * (1 - maxWinrate / 100)) * 0.96;
   let maxWinrateInUsd = maxWinrateThcEarned * currentThcPrice;
   let maxWinrateInWbnb = maxWinrateInUsd / currentWBNBPrice;
   return maxWinrateInWbnb;
}

async function main() {
   const client = await auth.getClient();
   const googleSheets = google.sheets({ version: "v4", auth: client });

   googleSheetsProvider.googleSheetsApi = googleSheets;

   let maxWinratePerChamp = await googleSheetsProvider.getCurrentWinrateForChamps("");
   console.log(maxWinratePerChamp);

   let heroListingsCheck = [];

   let currentThcPrice = (await httpRequest("https://exchange.thetanarena.com/exchange/v1/currency/price/1")) * thcMargin;
   let currentWBNBPrice = await httpRequest("https://exchange.thetanarena.com/exchange/v1/currency/price/32");

   async function currentPrice() {
      currentThcPrice = (await httpRequest("https://exchange.thetanarena.com/exchange/v1/currency/price/1")) * thcMargin;
      currentWBNBPrice = await httpRequest("https://exchange.thetanarena.com/exchange/v1/currency/price/32");
   }

   setInterval(currentPrice, 180000);

   setInterval(async () => {
      maxWinratePerChamp = await googleSheetsProvider.getCurrentWinrateForChamps("");
      console.log(maxWinratePerChamp);
   }, 900000);

   let mainNonce = await web3.eth.getTransactionCount(mainAddress).catch((err) => {
      console.log(err);
   });

   setInterval(async () => {
      mainNonce = await web3.eth.getTransactionCount(mainAddress).catch((err) => {
         console.log(err);
      });
   }, 60000);

   while (true) {
      let listings = await httpRequest("https://data.thetanarena.com/thetan/v1/nif/search?sort=Latest&from=0&size=5").catch((err) => {
         console.log(err);
      });

      if (!listings) {
         await sleep(1000);
         continue;
      }

      listings.forEach(async (elem, i) => {
         let id = elem["id"];
         if (i >= 5 || heroListingsCheck.includes(id)) return;

         heroListingsCheck.push(id);
         if (heroListingsCheck.length > 16) {
            heroListingsCheck.shift();
         }

         let price = elem["price"] / 100000000;
         let gamesToPlay = elem["battleCap"];
         let name = elem["name"].trim();
         let owner = elem["ownerAddress"];
         if (
            owner.toLowerCase() == AAddress.toLowerCase() ||
            owner.toLowerCase() == Saddress.toLowerCase() ||
            owner.toLowerCase() == "0xAf816E10238aD81dF491B69F0EfFB1c7674544FD".toLowerCase() ||
            owner.toLowerCase() == mainAddress.toLowerCase() ||
            name.toLowerCase() == "veinka"
         )
            return;
         let rarity = heroRarityDict[elem["heroRarity"]];
         let heroWinThc = heroRarityWinThcDic[elem["heroRarity"]];
         let maxWinrate = maxWinratePerChamp[name] - winrateMargin[rarity];

         let breakEvenWinrateWithFee = breakEvenWinrateWithFeeFunction(price, gamesToPlay, heroWinThc);

         let maxWinrateInWbnb = maxWinrateInWbnbWithFeeFunction(maxWinrate, gamesToPlay, heroWinThc, currentThcPrice, currentWBNBPrice);

         let maxWinrateInThc = maxWinrateInThcFunction(maxWinrate, gamesToPlay, heroWinThc);

         let priceInBNB = price * currentThcPrice;
         priceInBNB = priceInBNB / currentWBNBPrice;

         let maxWinrateInWbnbWithFee = maxWinrateInWbnb * 0.9585;
         let differenceBetweenWinrateWbnbAndHeroPrice = maxWinrateInWbnbWithFee - priceInBNB;
         let differenceBetweenWinrateWbnbAndHeroPriceInThc = (differenceBetweenWinrateWbnbAndHeroPrice * currentWBNBPrice) / currentThcPrice;
         let maxGweiToPay = (1000000000 * (differenceBetweenWinrateWbnbAndHeroPrice - minimumProfit)) / 250000;
         maxGweiToPay = maxGweiToPay > 0 ? maxGweiToPay : 0;

         if (priceInBNB <= 0 || maxWinrateInWbnb <= 0) {
            currentPrice();
         }

         console.log(
            `Price: ${price} ${name + " ".repeat(12 - name.length)} | ${breakEvenWinrateWithFee.toFixed(1)} | ${maxWinrate.toFixed(3)} | ${maxWinrateInThc.toFixed(3)} | ${maxGweiToPay.toFixed(1)}`
         );

         if (
            (differenceBetweenWinrateWbnbAndHeroPriceInThc < 100 && price <= 1000) ||
            (differenceBetweenWinrateWbnbAndHeroPriceInThc < 150 && price <= 1700 && price > 1000) ||
            (differenceBetweenWinrateWbnbAndHeroPriceInThc < 250 && price <= 3500 && price > 1700) ||
            (differenceBetweenWinrateWbnbAndHeroPriceInThc < 450 && price <= 4000 && price > 3500) ||
            (differenceBetweenWinrateWbnbAndHeroPriceInThc < 600 && price > 4000)
         ) {
            return;
         }
         if (
            priceInBNB > 0 &&
            maxWinrateInWbnb > 0 &&
            maxGweiToPay >= 15 &&
            ((rarity == "Common" && price <= maxPriceCommon) || (rarity == "Epic" && price <= maxPriceEpic) || (rarity == "Legendary" && price <= maxLegendaryPrice))
         ) {
            await makeTransaction(elem, price, maxGweiToPay, breakEvenWinrateWithFee, maxWinrateInThc, maxWinrate, currentThcPrice, currentWBNBPrice, false, mainNonce).catch((err) => {
               console.log(err);
            });
            console.log(mainNonce);
            mainNonce++;
            console.log(mainNonce);
         }
   }
}

main();
