import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { gasPrice, maticDiamondAddress } from "../scripts/helperFunctions";
import { Signer } from "@ethersproject/abstract-signer";
import { DAOFacet } from "../typechain";
import { ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { getPolygonAndMainnetGotchis } from "../scripts/query/queryAavegotchis";
import { NonceManager } from "@ethersproject/experimental";

import { LedgerSigner } from "@ethersproject/hardware-wallets";

interface TaskArgs {
  filename: string;
  xpAmount: string;
  batchSize: string;
  excludedAddresses: string;
}

task("grantXP", "Grants XP to Gotchis by addresses")
  .addParam("filename", "File that contains the airdrop")
  .addParam("xpAmount", "Amount of XP that each Aavegotchi should receive")
  .addParam(
    "batchSize",
    "How many Aavegotchis to send at a time. Default is 500"
  )
  .addParam("excludedAddresses", "Any addresses excluded")

  .setAction(async (taskArgs: TaskArgs, hre: HardhatRuntimeEnvironment) => {
    const filename: string = taskArgs.filename;
    const xpAmount: number = Number(taskArgs.xpAmount);
    const batchSize: number = Number(taskArgs.batchSize);
    const excludedAddresses: string[] = taskArgs.excludedAddresses
      .split(",")
      .map((val) => val.toLowerCase());

    let { addresses } = require(`../data/airdrops/${filename}.ts`);

    //Filter out addresses
    addresses = addresses.filter((address: string) => {
      return !excludedAddresses.includes(address.toLowerCase());
    });

    const { finalUsers, tokenIds } = await getPolygonAndMainnetGotchis(
      addresses,
      hre
    );

    const diamondAddress = maticDiamondAddress;
    const gameManager = "0x8D46fd7160940d89dA026D59B2e819208E714E82";
    console.log(gameManager);
    let signer: Signer;
    const testing = ["hardhat", "localhost"].includes(hre.network.name);
    if (testing) {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [gameManager],
      });
      signer = await hre.ethers.provider.getSigner(gameManager);
    } else if (hre.network.name === "matic") {
      const accounts = await hre.ethers.getSigners();
      signer = accounts[0];

      // signer = new LedgerSigner(hre.ethers.provider, "hid", "m/44'/60'/2'/0/0");
    } else throw Error("Incorrect network selected");

    const managedSigner = new NonceManager(signer);

    const batches = Math.ceil(tokenIds.length / batchSize);

    console.log(
      `Sending ${xpAmount} XP to ${tokenIds.length} Aavegotchis in ${finalUsers.length} addresses!`
    );

    const dao = (
      await hre.ethers.getContractAt("DAOFacet", diamondAddress)
    ).connect(managedSigner) as DAOFacet;

    for (let index = 0; index < batches; index++) {
      console.log("Current batch id:", index);

      const offset = batchSize * index;
      const sendTokenIds = tokenIds.slice(offset, offset + batchSize);

      console.log("send token ids:", sendTokenIds);

      sendTokenIds.forEach((id) => {
        console.log(id);
      });

      console.log(
        `Sending ${xpAmount} XP to ${sendTokenIds.length} Aavegotchis `
      );

      const tx: ContractTransaction = await dao.grantExperience(
        sendTokenIds,
        Array(sendTokenIds.length).fill(xpAmount),
        { gasPrice: gasPrice }
      );
      console.log("tx:", tx.hash);
      let receipt: ContractReceipt = await tx.wait();

      if (!receipt.status) {
        throw Error(`Error:: ${tx.hash}`);
      }
      console.log(
        "Airdropped XP to Aaavegotchis. Last tokenID:",
        sendTokenIds[sendTokenIds.length - 1]
      );
    }
  });
