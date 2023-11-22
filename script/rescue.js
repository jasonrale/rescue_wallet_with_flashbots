const { ethers } = require("ethers");
const { FlashbotsBundleProvider, FlashbotsBundleResolution, } = require("@flashbots/ethers-provider-bundle");

// 获取当前账户的nonce
async function getCurrentNonce(wallet) {
  try {
    const nonce = await wallet.getTransactionCount("pending");
    console.log("Nonce:", nonce);
    return nonce;
  } catch (error) {
    console.error("Error fetching nonce:", error.message);
    throw error;
  }
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider("RPC节点, 在Infura, NodeReal, Alchemy上注册申请");

  const SIGNER_PK = "声誉私钥";

  const SF_PK = "安全钱包私钥";

  const HK_PK = "被盗钱包私钥";

  // 声誉钱包(随便一个钱包，只用来签名，不交易)
  const authSigner = new ethers.Wallet(SIGNER_PK, provider);

  // 安全钱包
  const safeWallet = new ethers.Wallet(SF_PK, provider);

  // 被盗钱包
  const hackedWallet = new ethers.Wallet(HK_PK, provider);

  const flashbotsRPC = "https://relay.flashbots.net";  //这是ETH主网上Flashbots RPC, 官方文档上找
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, flashbotsRPC);

  // ERC20代币的合约地址
  const tokenContractAddress = "tokenContractAddress";

  // 循环直到上链
  let i = 1;
  while(i > 0) {
    let feeData = await provider.getFeeData();

    // 安全钱包nonce
    let newNonce = await getCurrentNonce(safeWallet);

    // 被盗钱包nonce
    let hackedNonce = await getCurrentNonce(hackedWallet);

    // 创建一个向被盗钱包转Gas的交易
    const gasTransaction = {
      transaction: {
        from: "new wallet address",
        to: "hacked wallet address",
        value: ethers.utils.parseEther("0.005"), //0.005ETH
        type: 2,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        gasLimit: 21000,
        chainId: 1, //链id
        nonce: newNonce
      },
      signer: safeWallet //这条交易谁发起就用谁签名
    };
  
    // 创建一个调用领取函数的交易
    const claimTransaction = {
      transaction: {
        to: "领取代币的合约地址",
        data: "TX DATA", // 领取代币的函数的数据
        type: 2,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        gasLimit: 115000, // 自己去metamask，链上或者模拟交易的数据中找，以为模拟交易数据为准
        chainId: 1,       
        nonce: hackedNonce
      },
      signer: hackedWallet
    };
    
    // 创建一个将代币转移到安全钱包的交易
    const transferTransaction =   {
      transaction: {
        to: tokenContractAddress, 
        data: "TX DATA",
        type: 2,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        gasLimit: 56000, // 自己去metamask，链上或者模拟交易的数据中找，以为模拟交易数据为准
        chainId: 1,
        nonce: hackedNonce + 1  // 每条TX都会使nonce加1
      },
      signer: hackedWallet
    };
  
    // 创建一个捆绑交易
    const transactionBundle = [gasTransaction, claimTransaction, transferTransaction];
    
    let blockNumber = await provider.getBlockNumber();
    const targetBlockNumber = blockNumber + 1;
    console.log(`Current Block Number: ${blockNumber}, Target Block Number:${targetBlockNumber}`);
     
    // 先模拟交易，观察是否成功，交易的Gas等参数
    //const signedTransactions = await flashbotsProvider.signBundle(transactionBundle)
    //const bundleResponse = await flashbotsProvider.simulate(signedTransactions, targetBlockNumber);

    // 发送捆绑交易（上链）
    const bundleResponse = await flashbotsProvider.sendBundle(transactionBundle, targetBlockNumber);
    
    if ('error' in bundleResponse) {
      console.error("Bundle submission error:", bundleResponse.error.message);
    } else {
      console.log(JSON.stringify(bundleResponse, null, 2))
    }

    const bundleResolution = await bundleResponse.wait()
    if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`第${i}次发送交易, 交易成功！在区块${targetBlockNumber}中`);
      i = -1;
    } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
      console.log(`第${i}次发送交易, 不在区块${targetBlockNumber}中`);
      i++;
    } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      i++;
      console.log("Nonce too high, failed");
    }
  }
}

main().catch(console.error);