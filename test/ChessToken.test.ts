import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

async function deployChessTokenFixture() {
  const [owner, addr1, addr2] = await hre.ethers.getSigners();
  const initialSupply = "1000000000";

  const initialSupplyParsed = hre.ethers.parseUnits(initialSupply, 18);

  const chessToken = await hre.ethers.deployContract("ChessToken", [
    initialSupplyParsed,
  ]);

  return {
    chessToken,
    owner,
    addr1,
    addr2,
    initialSupply: initialSupplyParsed,
  };
}

describe("ChessToken", function () {
  describe("Deployment", function () {
    it("Should set the correct initial supply and owner balance", async function () {
      const { chessToken, owner, initialSupply } = await loadFixture(
        deployChessTokenFixture
      );

      const expectedTotalSupply = initialSupply;

      const totalSupply = await chessToken.totalSupply();
      const ownerBalance = await chessToken.balanceOf(owner.address);

      expect(totalSupply).to.equal(expectedTotalSupply);
      expect(ownerBalance).to.equal(expectedTotalSupply);
    });

    it("Should set the correct token name and symbol", async function () {
      const { chessToken } = await loadFixture(deployChessTokenFixture);

      expect(await chessToken.name()).to.equal("ChessToken");
      expect(await chessToken.symbol()).to.equal("CHESS");
    });
  });

  describe("Minting", function () {
    it("Should allow ChessFactory to mint tokens", async function () {
      const { chessToken, owner, addr1, addr2 } = await loadFixture(
        deployChessTokenFixture
      );

      await chessToken.connect(owner).setChessFactory(addr1.address);

      const mintAmount = hre.ethers.parseUnits("100", 18);
      await chessToken.connect(addr1).mintTokens(addr2.address, mintAmount);

      const addr2Balance = await chessToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(mintAmount);
    });
  });
});
