type ResultsProps = {
  data: Array<{
    url: string;
    label: string;
  }>;
};

const Results = ({ data }: ResultsProps) => {
  return (
    <div className="">
      <h2 className="text-lg mb-4">
        Base de données publique des médicaments (BDPM)
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-white rounded-lg shadow-md hover:shadow-lg"
          >
            <h3 className="text-md">{item.label}</h3>
          </a>
        ))}
      </div>
    </div>
  );
};

export default Results;
