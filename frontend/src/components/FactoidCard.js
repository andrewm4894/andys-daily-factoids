import './FactoidCard.css';

function FactoidCard({ factoid, onVote }) {
  return (
    <div className="factoid-card">
      <p>{factoid.text}</p>
      <div className="meta">
        <button onClick={() => onVote(factoid.id, 'up')}>👍</button>
        <button onClick={() => onVote(factoid.id, 'down')}>👎</button>
        <span>Upvotes: {factoid.votesUp}</span>
        <span>Downvotes: {factoid.votesDown}</span>
        <span>{new Date(factoid.createdAt._seconds * 1000).toLocaleString()}</span>
      </div>
    </div>
  );
}


export default FactoidCard;