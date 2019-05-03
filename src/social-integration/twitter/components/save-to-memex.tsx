import 'babel-polyfill'
import React, { Component } from 'react'
import { getTweetInfo } from '../get-tweet-data'
import { remoteFunction } from 'src/util/webextensionRPC'
import appendReactDOM from 'append-react-dom'
import { TagHolder } from 'src/common-ui/components'
import ActionBar from './action-bar'

import cx from 'classnames'

const styles = require('./styles.css')

interface Props {
    element: HTMLElement
}

interface State {
    isMouseInside: boolean
    saved: boolean
    setTagHolder: boolean
    tags: string[]
}

class SaveToMemex extends Component<Props, State> {
    private addTweetRPC
    private url: string

    constructor(props: Props) {
        super(props)
        this.addTweetRPC = remoteFunction('addTweet')
        this.url =
            'https://twitter.com' +
            this.props.element.getAttribute('data-permalink-path')
        this.state = {
            isMouseInside: false,
            saved: false,
            setTagHolder: false,
            tags: [],
        }
    }

    async componentDidMount() {
        const tags = await remoteFunction('fetchPageTags')(this.url)
        this.setState(state => ({
            tags,
        }))
        this.attachTagHolder()
    }

    componentDidUpdate() {
        this.attachTagHolder()
    }

    private attachTagHolder() {
        if (window.location.href === this.url && !this.state.setTagHolder) {
            const tweetFooter = this.props.element.querySelector(
                '.stream-item-footer',
            )
            if (tweetFooter) {
                appendReactDOM(TagHolder, tweetFooter, {
                    tags: this.state.tags,
                    maxTagsLimit: 10,
                    handlePillClick: () => {},
                })
            }
            this.setState(state => ({
                setTagHolder: true,
            }))
        }
    }

    private saveTweet = async doc => {
        const tweet = getTweetInfo(doc)
        try {
            const id = await this.addTweetRPC(tweet)
        } catch (e) {
            console.error(e)
            return
        }
        this.setState(state => ({
            saved: true,
        }))
    }

    private handleMouseEnter = () => {
        this.setState(state => ({
            isMouseInside: true,
        }))
    }

    private handleMouseLeave = () => {
        this.setState(state => ({
            isMouseInside: false,
        }))
    }

    private handleClick: React.MouseEventHandler<HTMLButtonElement> = e => {
        e.preventDefault()
        this.saveTweet(this.props.element)
    }

    render() {
        const permalink = this.props.element.getAttribute('data-permalink-path')
        const elementId = this.props.element.getAttribute('data-item-id')
        const actionList = this.props.element.querySelector(
            '.ProfileTweet-actionList',
        )
        return (
            <div
                onMouseEnter={this.handleMouseEnter}
                onMouseLeave={this.handleMouseLeave}
                className={styles.container}
            >
                <div className="ProfileTweet-action ProfileTweet-action--stm">
                    <button
                        className="ProfileTweet-actionButton u-textUserColorHover js-actionButton"
                        type="button"
                        data-nav="share_tweet_to_memex"
                        onClick={this.handleClick}
                    >
                        <div
                            className="IconContainer js-tooltip"
                            data-original-title="Save To Memex"
                            id={`memexButton-${elementId}`}
                            data-permanlink-path={permalink}
                            data-item-id={elementId}
                        >
                            <span className="Icon Icon--medium Icon--saveToMemex">
                                {!this.state.saved ? 
                                <svg
                                    width="100"
                                    height="100"
                                    viewBox="0 0 550 550"
                                    className={styles.memexIcon}
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M6.11893 6.71486C6.04512 6.71486 5.97038 6.69719 5.90095 6.66052C5.67139 6.53925 5.5835 6.25432 5.70424 6.02404C5.76835 5.90184 7.29145 3.03204 9.30589 3.16148C9.56485 3.17742 9.76126 3.40117 9.74531 3.66098C9.72943 3.92079 9.50292 4.11744 9.24803 4.10205C8.07521 4.02163 6.89144 5.78151 6.53428 6.46291C6.45048 6.62314 6.28752 6.71486 6.11894 6.71486" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M2.89639 12.1731C2.6956 12.1731 2.50983 12.0424 2.4479 11.8394C2.37221 11.5906 2.51172 11.3277 2.75878 11.2513C2.87198 11.2158 5.38809 10.3946 4.76822 7.97062C4.70379 7.71835 4.85517 7.46138 5.10599 7.39698C5.35745 7.33162 5.61296 7.484 5.67739 7.73595C6.35294 10.3799 4.24373 11.7807 3.03369 12.1523C2.98804 12.1663 2.94205 12.1732 2.8964 12.1732" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M7.93473 8.90285C7.90535 8.90285 7.87594 8.90015 7.84622 8.89426C7.59133 8.84524 7.42463 8.59864 7.4731 8.34292C8.12394 4.92274 10.9456 4.88818 10.9856 4.88818H10.9859C11.2449 4.88913 11.4541 5.10118 11.4529 5.3613C11.4516 5.62079 11.2421 5.83033 10.9844 5.83064C10.8937 5.83158 8.89643 5.88373 8.39509 8.51979C8.35193 8.74567 8.1552 8.90274 7.93472 8.90274" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M3.73696 15.2654C3.6494 15.2654 3.56118 15.2408 3.48238 15.1896C3.26471 15.048 3.20278 14.7561 3.34353 14.5378C3.65096 14.0618 6.41538 9.88672 8.8905 9.88232H8.89114C9.1501 9.88232 9.35995 10.0928 9.36027 10.3526C9.3609 10.6127 9.15134 10.8242 8.89208 10.8248C7.22073 10.828 4.88853 13.8762 4.13105 15.0505C4.04129 15.1897 3.89054 15.2654 3.73698 15.2654" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M6.4757 17.5264C6.38531 17.5264 6.2943 17.5003 6.21393 17.446C5.99907 17.3005 5.94214 17.0077 6.08694 16.7919V16.7919C6.58469 16.0493 6.695 15.1092 6.92348 14.2449C7.19139 13.2314 8.00746 12.7969 8.57959 12.614C8.82667 12.5342 9.09 12.6718 9.16882 12.92C9.24731 13.1678 9.11096 13.433 8.8642 13.5118C7.94282 13.8065 7.61693 14.4672 7.83868 15.5906C7.86681 15.7332 7.90936 15.9481 7.72576 16.1319V16.1319C7.69048 16.1668 7.65269 16.1992 7.62231 16.2385C7.46705 16.4393 7.13667 16.9136 6.86505 17.3184C6.77437 17.4535 6.62611 17.5264 6.47568 17.5264" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M9.16161 17.1306C8.96707 17.1306 8.78537 17.0081 8.71812 16.8133C8.4848 16.1351 7.46555 16.2639 7.45492 16.2658C7.19846 16.2978 6.96202 16.1191 6.92761 15.8611C6.8932 15.6032 7.07335 15.366 7.33044 15.3315C7.99316 15.2419 9.2204 15.3883 9.60509 16.5051C9.68952 16.7511 9.55973 17.0194 9.31485 17.1046C9.26418 17.1222 9.21227 17.1306 9.16162 17.1306" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M7.67901 19.6678C7.32904 19.6678 6.96218 19.6304 6.59626 19.5537C5.88225 19.4042 4.57744 18.976 3.86374 17.7897C3.72958 17.567 3.80056 17.2773 4.0223 17.1426C4.24405 17.0084 4.53209 17.0791 4.66626 17.3022C5.05345 17.9455 5.82688 18.43 6.78797 18.6313C7.7844 18.8396 8.60163 18.6772 8.93909 18.4372C9.14989 18.287 9.44355 18.3373 9.59305 18.5496C9.74284 18.7623 9.6925 19.0564 9.48109 19.2065C9.057 19.5078 8.40397 19.6677 7.67901 19.6677" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M9.10629 0.769531C8.52082 0.769531 7.92878 0.937609 7.48154 1.23071C7.23009 1.39533 6.91577 1.54549 6.58301 1.70445C5.75265 2.10123 4.81157 2.55078 4.26769 3.49764C3.90771 4.125 3.92992 4.69237 3.94649 5.10674V5.10674C3.95513 5.33766 3.8588 5.55413 3.67612 5.69565C3.6474 5.71791 3.62008 5.73883 3.59588 5.75735C3.40354 5.90438 3.20494 6.05642 3.04324 6.24114C1.73906 7.73023 2.07465 9.088 2.27512 9.89915C2.3186 10.0744 2.35956 10.24 2.37209 10.3588C2.39651 10.5878 2.37146 11.0757 2.35157 11.4677C2.33276 11.8409 2.31467 12.1931 2.32715 12.4498C2.34644 12.8456 2.51792 13.2559 2.73998 13.751C2.79191 13.8663 2.85038 13.997 2.87101 14.0563C3.04208 14.5496 3.15624 15.569 3.19346 15.9039C3.50903 18.7247 5.48625 19.7372 6.93023 20.4767C7.18169 20.6055 7.41907 20.7271 7.63612 20.8505C8.03644 21.0789 8.64381 21.2266 9.18362 21.2266C10.256 21.2266 11.0148 20.6473 11.1637 19.7152C11.3141 18.7727 11.3294 17.7241 11.3235 16.7317V16.7277C11.3012 12.982 11.3161 3.31773 11.3296 2.85279C11.3454 2.28825 11.1626 1.79189 10.7998 1.4171C10.3958 0.999492 9.79438 0.769531 9.10632 0.769531H9.10629ZM9.14635 16.4895C9.14635 16.4895 9.14636 16.4895 9.14635 16.4895C9.14628 16.4893 9.13629 16.4727 9.12315 16.4508C9.12828 16.4597 9.1339 16.4685 9.14001 16.4788C9.14402 16.4855 9.146 16.4889 9.14631 16.4895C9.14632 16.4895 9.14635 16.4895 9.14635 16.4895V16.4895ZM9.68832 3.74749C9.68769 3.74749 9.68734 3.7478 9.68707 3.7478H9.68677C9.68723 3.7478 9.68754 3.74764 9.68789 3.74755C9.68815 3.74748 9.68842 3.74738 9.68862 3.74718V3.74718L9.68832 3.74749C9.68831 3.74749 9.68831 3.74749 9.68832 3.74749V3.74749ZM9.10629 1.71199C9.77902 1.71199 10.4139 2.0318 10.3914 2.82535C10.3765 3.34653 10.3636 13.1079 10.385 16.7332V16.7256C10.3847 16.6405 10.3841 16.5739 10.3838 16.5173V16.4938V16.5173C10.3844 16.5968 10.3848 16.6773 10.385 16.7256V16.7337V16.7372C10.3904 17.6397 10.3789 18.6742 10.2368 19.5658C10.1498 20.1121 9.67665 20.284 9.18344 20.284C8.75872 20.284 8.31899 20.1564 8.09912 20.0308C6.58665 19.1687 4.43241 18.5417 4.12591 15.7985C4.04866 15.108 3.93702 14.2657 3.75686 13.7461C3.64927 13.4357 3.2821 12.7685 3.26428 12.4034C3.24059 11.9187 3.36153 10.7918 3.30494 10.2587C3.21487 9.40733 2.4996 8.28831 3.74749 6.86331C4.0437 6.52528 4.81057 6.15646 4.87156 5.68367C4.95194 5.0585 4.73581 4.56873 5.08048 3.96839C5.66721 2.94644 7.04989 2.63858 7.99409 2.01969C8.29089 1.82524 8.70529 1.71182 9.10624 1.71182" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12.9242 0.769558C12.9242 0.769541 12.9242 0.769531 12.9242 0.769531C12.2361 0.769542 11.6347 0.999492 11.231 1.417C10.8682 1.79179 10.6852 2.28815 10.7012 2.85237C10.7146 3.31795 10.7293 12.9826 10.7073 16.7276V16.7374C10.7012 17.7242 10.7168 18.7728 10.8671 19.7153C11.016 20.6474 11.7747 21.2267 12.8471 21.2267C13.3869 21.2267 13.9943 21.079 14.3946 20.8506C14.6117 20.7272 14.8491 20.6056 15.1005 20.4768C16.5445 19.7373 18.5217 18.7247 18.8373 15.904C18.8745 15.5691 18.9887 14.5499 19.1597 14.0567C19.1805 13.997 19.2388 13.8663 19.2908 13.7511C19.5128 13.2559 19.6842 12.8457 19.7036 12.4495C19.7161 12.1932 19.698 11.841 19.6792 11.4678C19.6592 11.0757 19.6341 10.5878 19.6584 10.3588C19.6709 10.2401 19.7119 10.0745 19.7554 9.8992C19.9559 9.08805 20.2914 7.73028 18.9873 6.24119C18.8256 6.05648 18.627 5.90442 18.4346 5.7574C18.4104 5.73888 18.3831 5.71796 18.3544 5.69571C18.1717 5.55418 18.0753 5.3377 18.084 5.10679V5.10679C18.1006 4.69242 18.1228 4.12505 17.7628 3.49769C17.219 2.55084 16.2779 2.10128 15.4476 1.70451C15.1148 1.54556 14.8008 1.39538 14.5493 1.23076C14.1018 0.937666 13.5098 0.769594 12.9243 0.769585C12.9243 0.769585 12.9243 0.769576 12.9242 0.769558V0.769558ZM12.8842 16.4894C12.8842 16.4894 12.8843 16.4895 12.8843 16.4894C12.8846 16.4889 12.8865 16.4854 12.8906 16.4787C12.8969 16.4684 12.9021 16.4596 12.9075 16.4508C12.8943 16.4728 12.8843 16.4893 12.8842 16.4894C12.8842 16.4894 12.8842 16.4894 12.8842 16.4894V16.4894ZM12.3422 3.74735C12.3428 3.74735 12.3432 3.74765 12.3437 3.74765H12.3434C12.3432 3.74765 12.343 3.74749 12.3426 3.7474C12.3423 3.74733 12.3421 3.74724 12.3419 3.74704V3.74704L12.3422 3.74734C12.3422 3.74735 12.3422 3.74735 12.3422 3.74735V3.74735ZM12.9242 1.71195C13.3251 1.71195 13.7398 1.82566 14.0363 2.01982C14.9805 2.6387 16.3632 2.94657 16.9499 3.96851C17.2946 4.56886 17.0785 5.05863 17.1589 5.68379C17.2198 6.15659 17.9867 6.52541 18.2829 6.86344C19.5308 8.28844 18.8155 9.40745 18.7254 10.2588C18.6688 10.7919 18.7899 11.9188 18.7661 12.4035C18.7483 12.7686 18.3811 13.4358 18.2735 13.7462C18.0934 14.2658 17.9817 15.1081 17.9045 15.7986C17.598 18.5418 15.4437 19.1688 13.9313 20.0309C13.7114 20.1565 13.2717 20.2841 12.847 20.2841C12.3541 20.2841 11.8805 20.1122 11.7936 19.5659C11.6513 18.6744 11.64 17.6398 11.6453 16.7373V16.7338V16.7258C11.6453 16.6934 11.6457 16.6472 11.646 16.5966C11.6463 16.5586 11.6466 16.5247 11.6466 16.4939C11.6466 16.5285 11.6463 16.5633 11.646 16.5966C11.646 16.6346 11.6457 16.6771 11.6453 16.7258V16.7334C11.6668 13.108 11.6541 3.34665 11.639 2.82547C11.6165 2.0316 12.2514 1.71211 12.9241 1.71211" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M15.9117 6.71463C15.7434 6.71463 15.5805 6.62322 15.4964 6.46331C15.1376 5.78191 13.956 4.02139 12.7823 4.10213C12.5308 4.11783 12.301 3.92085 12.285 3.66106C12.2691 3.40125 12.4655 3.17758 12.7244 3.16156C14.7392 3.03087 16.2623 5.90192 16.3264 6.02412C16.4471 6.25439 16.3592 6.53871 16.13 6.66028C16.0605 6.69703 15.9855 6.71462 15.9117 6.71462" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M19.1336 12.1729C19.0879 12.1729 19.042 12.1663 18.9966 12.1523C17.7866 11.7807 15.6774 10.3799 16.3529 7.73594C16.4173 7.48399 16.6722 7.33163 16.9243 7.39697C17.1751 7.46137 17.3265 7.71835 17.2621 7.97062C16.6416 10.3975 19.1642 11.2177 19.2718 11.2513C19.5186 11.3286 19.6575 11.5922 19.5815 11.8404C19.5189 12.0427 19.3341 12.173 19.1336 12.173" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.0959 8.90324C13.8755 8.90324 13.6787 8.74615 13.6356 8.52029C13.1314 5.86883 11.1573 5.83113 11.0504 5.83113C11.0479 5.83083 11.0477 5.83113 11.0467 5.83113C10.7887 5.83113 10.5788 5.62127 10.5776 5.36179C10.5763 5.10167 10.7856 4.88961 11.0445 4.88867H11.0448C11.0845 4.88867 13.9068 4.92292 14.5577 8.34342C14.6061 8.59914 14.4394 8.84575 14.1845 8.89476C14.1548 8.9004 14.1254 8.90334 14.096 8.90334" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M18.2934 15.2653C18.1398 15.2653 17.9891 15.1896 17.8993 15.0505C17.1409 13.8761 14.8074 10.8279 13.1386 10.8248C12.8793 10.8241 12.6698 10.6127 12.6704 10.3526C12.6707 10.0928 12.8806 9.88232 13.1395 9.88232H13.1402C15.615 9.88674 18.3794 14.0618 18.6868 14.5378C18.8276 14.7561 18.7656 15.0479 18.5483 15.1893C18.4692 15.2408 18.3809 15.2653 18.2934 15.2653" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.5657 16.2641C14.6145 16.272 14.6692 16.2727 14.7289 16.2607C14.6745 16.2717 14.6188 16.2722 14.5657 16.2641ZM15.5549 17.5264C15.4045 17.5264 15.2563 17.4535 15.1656 17.3184C14.894 16.9139 14.5639 16.4399 14.4084 16.2387C14.378 16.1993 14.34 16.1669 14.3045 16.1319V16.1319C14.1209 15.9481 14.1635 15.7332 14.1916 15.5906C14.4134 14.4672 14.0875 13.8065 13.1661 13.5118C12.9193 13.433 12.783 13.1682 12.8615 12.92C12.94 12.6718 13.2036 12.5342 13.451 12.614C14.0228 12.7969 14.8384 13.2312 15.1065 14.2441C15.3353 15.1086 15.4457 16.0492 15.9437 16.7919V16.7919C16.0885 17.0077 16.0315 17.3005 15.8167 17.446C15.7363 17.5003 15.6453 17.5264 15.5549 17.5264" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12.8688 17.131C12.8181 17.131 12.7662 17.1224 12.7156 17.1049C12.4707 17.0198 12.3409 16.7515 12.4253 16.5055C12.81 15.3887 14.0357 15.2426 14.7 15.3319C14.9571 15.3664 15.1372 15.6036 15.1028 15.8615C15.0684 16.1191 14.8326 16.3013 14.5774 16.2661C14.5598 16.2643 13.5415 16.1464 13.3123 16.8137C13.245 17.0085 13.0633 17.131 12.8688 17.131" fill="#36362F"/>
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.3513 19.6681C13.6264 19.6681 12.9733 19.5082 12.5492 19.2069C12.3378 19.0567 12.2875 18.7627 12.4373 18.55C12.5865 18.3376 12.8804 18.2874 13.0912 18.4375C13.4287 18.6775 14.2459 18.84 15.2424 18.6317C16.2034 18.4303 16.9769 17.9459 17.3641 17.3025C17.4982 17.0794 17.7863 17.0091 18.008 17.1429C18.2298 17.2777 18.3008 17.5673 18.1666 17.7901C17.4529 18.9763 16.1481 19.4045 15.4341 19.554C15.0681 19.6307 14.7013 19.6681 14.3513 19.6681" fill="#36362F"/>

                                </svg> : 
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="-3 -3 44 44"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M28 11L14.25 24L8 18.0909" stroke="#444444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                                    <circle cx="18" cy="18" r="17" stroke="#444444" stroke-width="2"/>
                                </svg>
                                }
                            </span>
                        </div>
                    </button>
                </div>
                {/*{this.state.isMouseInside && <ActionBar url={this.url} />}*/}
            </div>
        )
    }
}

export default SaveToMemex
